import type { Prisma } from "@prisma/client";
import { v4 as uuid } from "uuid";

import type {
  BulkUpdateTicketsInput,
  CreateMessageInput,
  CreateTicketInput,
  ListTicketsQuery,
  UpdateTicketInput,
} from "./tickets.schema";

import { env } from "@/config/env";
import { aiClient } from "@/lib/ai-client";
import { AppError } from "@/lib/app-error";
import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { automationEngine } from "@/modules/automations/automation-engine.service";
import { slaService } from "@/modules/sla/sla.service";
import { ticketTrackingService } from "@/modules/ticket-tracking/ticket-tracking.service";

type AiAuthorType = "customer" | "agent" | "ai" | "system";

async function buildAiMessageHistory(ticketId: string): Promise<{ author_type: AiAuthorType; body: string }[]> {
  const messages = await prisma.ticketMessage.findMany({
    where: { ticketId, isInternalNote: false },
    orderBy: { createdAt: "asc" },
    select: { authorType: true, body: true },
  });
  return messages.map((m: { authorType: string; body: string }) => ({
    author_type: m.authorType as AiAuthorType,
    body: m.body,
  }));
}

/** Annotates each ticket with `isUnread` for a specific viewer — see Feature 11. */
async function annotateUnread<T extends { id: string; lastCustomerActivityAt: Date | null }>(
  tickets: T[],
  userId: string
): Promise<(T & { isUnread: boolean })[]> {
  if (tickets.length === 0) return [];

  const views = await prisma.ticketView.findMany({
    where: { userId, ticketId: { in: tickets.map((t) => t.id) } },
    select: { ticketId: true, lastViewedAt: true },
  });
  const viewedAtByTicket = new Map(views.map((v) => [v.ticketId, v.lastViewedAt]));

  return tickets.map((t) => {
    const viewedAt = viewedAtByTicket.get(t.id);
    const isUnread = Boolean(t.lastCustomerActivityAt) && (!viewedAt || viewedAt < t.lastCustomerActivityAt!);
    return { ...t, isUnread };
  });
}

function buildTicketWhere(orgId: string, query: ListTicketsQuery): Prisma.TicketWhereInput {
  return {
    orgId,
    ...(query.status && { status: query.status }),
    ...(query.priority && { priority: query.priority }),
    ...(query.channel && { channel: query.channel }),
    ...(query.teamId && { teamId: query.teamId }),
    ...(query.unassigned ? { assigneeId: null } : query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    ...(query.search && { subject: { contains: query.search, mode: "insensitive" as const } }),
    ...((query.createdFrom || query.createdTo) && {
      createdAt: {
        ...(query.createdFrom && { gte: new Date(query.createdFrom) }),
        ...(query.createdTo && { lte: new Date(query.createdTo) }),
      },
    }),
  };
}

export const ticketsService = {
  async create(orgId: string, authorId: string, input: CreateTicketInput) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, orgId },
    });
    if (!customer) throw AppError.notFound("Customer not found in this organization");

    const createdAt = new Date();
    const { firstResponseDueAt, resolutionDueAt } = await slaService.computeDueDatesForOrg(
      orgId,
      input.priority,
      createdAt
    );

    const ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Atomically claim the next ticket number for this org, avoiding a
      // race between two tickets created at the same instant.
      const org = await tx.organization.update({
        where: { id: orgId },
        data: { nextTicketNumber: { increment: 1 } },
        select: { nextTicketNumber: true },
      });
      const number = org.nextTicketNumber - 1;

      const newTicket = await tx.ticket.create({
        data: {
          orgId,
          number,
          subject: input.subject,
          customerId: input.customerId,
          channel: input.channel,
          priority: input.priority,
          firstResponseDueAt,
          slaBreachAt: resolutionDueAt,
          ...(input.initialMessage && { lastCustomerActivityAt: new Date() }),
        },
      });

      if (input.initialMessage) {
        await tx.ticketMessage.create({
          data: {
            ticketId: newTicket.id,
            authorType: "customer",
            authorId: null,
            body: input.initialMessage,
          },
        });
      }

      return newTicket;
    });

    void automationEngine.run(orgId, "ticket_created", ticket, { messageText: input.initialMessage });

    if (!input.initialMessage) return ticket;

    // Fire-and-forget: never let an AI service hiccup block ticket creation.
    const summary = await aiClient.bestEffort(
      () =>
        aiClient.summarizeTicket({
          orgId,
          ticketId: ticket.id,
          messages: [{ author_type: "customer", body: input.initialMessage as string }],
        }),
      "tickets.create.summarize"
    );

    if (!summary) return ticket;

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { aiSummary: summary.summary, aiSentiment: summary.sentiment },
    });

    return { ...ticket, aiSummary: summary.summary, aiSentiment: summary.sentiment };
  },

  async list(orgId: string, userId: string, query: ListTicketsQuery) {
    const where = buildTicketWhere(orgId, query);
    const include = { customer: true, assignee: true } as const;

    if (!query.unreadOnly) {
      const [items, totalItems] = await prisma.$transaction([
        prisma.ticket.findMany({
          where,
          orderBy: { [query.sortBy]: query.sortOrder },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include,
        }),
        prisma.ticket.count({ where }),
      ]);

      return {
        items: await annotateUnread(items, userId),
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
          totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
        },
      };
    }

    // "Unread" isn't a column we can filter on directly (it's relative to
    // the requesting user), so this path fetches candidates with any
    // customer activity, annotates + filters in memory, then paginates the
    // filtered set. Fine at normal ticket-queue sizes; a materialized
    // per-user unread count would be the next step if this ever needs to
    // scale further.
    const candidates = await prisma.ticket.findMany({
      where: { ...where, lastCustomerActivityAt: { not: null } },
      orderBy: { [query.sortBy]: query.sortOrder },
      include,
    });
    const unread = (await annotateUnread(candidates, userId)).filter((t) => t.isUnread);
    const start = (query.page - 1) * query.pageSize;

    return {
      items: unread.slice(start, start + query.pageSize),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: unread.length,
        totalPages: Math.max(1, Math.ceil(unread.length / query.pageSize)),
      },
    };
  },

  async getById(orgId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, orgId },
      include: {
        customer: true,
        assignee: true,
        team: true,
        messages: { orderBy: { createdAt: "asc" } },
        inboundEmailMessages: {
          orderBy: { receivedAt: "asc" },
          select: {
            id: true,
            gmailMessageId: true,
            gmailThreadId: true,
            senderEmail: true,
            subject: true,
            attachments: true,
            receivedAt: true,
          },
        },
        attachments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });
    if (!ticket) throw AppError.notFound("Ticket not found");
    return ticket;
  },

  /** Records that `userId` viewed this ticket just now — drives the unread indicator in the inbox. */
  async markViewed(orgId: string, ticketId: string, userId: string) {
    await this.assertExists(orgId, ticketId);
    await prisma.ticketView.upsert({
      where: { ticketId_userId: { ticketId, userId } },
      create: { ticketId, userId },
      update: { lastViewedAt: new Date() },
    });
  },

  async update(orgId: string, ticketId: string, input: UpdateTicketInput, actorId?: string) {
    const current = await prisma.ticket.findFirst({ where: { id: ticketId, orgId } });
    if (!current) throw AppError.notFound("Ticket not found");

    const resolvedStatuses = new Set(["solved", "closed"]);
    const data: Record<string, unknown> = { ...input };
    if (input.status && resolvedStatuses.has(input.status)) {
      data.resolvedAt = new Date();
    }

    // Only enqueue a status email when the status actually changes — never
    // on a no-op update (e.g. re-saving the same status, or a PATCH that
    // only touches priority/assignee).
    const statusChanged = Boolean(input.status && input.status !== current.status);
    const assigneeChanged = input.assigneeId !== undefined && input.assigneeId !== current.assigneeId;
    const priorityChanged = Boolean(input.priority && input.priority !== current.priority);

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.ticket.update({ where: { id: ticketId }, data });

      if (statusChanged) {
        const wasResolved = resolvedStatuses.has(current.status);
        const isNowResolved = resolvedStatuses.has(updated.status);

        await tx.emailOutboxEvent.create({
          data: {
            orgId,
            eventType: "ticket.status.updated",
            ticketId,
            payload: {
              previousStatus: current.status,
              newStatus: updated.status,
              transitionType: wasResolved && !isNowResolved ? "reopened" : "status_changed",
            },
          },
        });
      }

      // Audit trail for privileged-role visibility (Feature 12). Written
      // directly on the transaction client (not the shared recordAudit
      // helper, which uses its own connection) so it commits atomically
      // with the ticket change it's describing.
      if (actorId && (statusChanged || assigneeChanged || priorityChanged)) {
        await tx.auditLog.create({
          data: {
            orgId,
            actorId,
            action: "ticket.updated",
            targetType: "ticket",
            targetId: ticketId,
            metadata: {
              ...(statusChanged && { status: { from: current.status, to: updated.status } }),
              ...(assigneeChanged && { assigneeId: { from: current.assigneeId, to: updated.assigneeId } }),
              ...(priorityChanged && { priority: { from: current.priority, to: updated.priority } }),
            },
          },
        });
      }

      return updated;
    });

    if (statusChanged) {
      const wasResolved = resolvedStatuses.has(current.status);
      const isNowResolved = resolvedStatuses.has(updated.status);
      void automationEngine.run(
        orgId,
        wasResolved && !isNowResolved ? "ticket_reopened" : "status_changed",
        updated
      );

      if (!wasResolved && isNowResolved) {
        void publishEvent(KAFKA_TOPICS.TICKET_RESOLVED, {
          eventId: uuid(),
          orgId,
          occurredAt: new Date().toISOString(),
          ticketId,
          status: updated.status,
        });
      }
    }

    if (assigneeChanged) {
      void publishEvent(KAFKA_TOPICS.TICKET_ASSIGNED, {
        eventId: uuid(),
        orgId,
        occurredAt: new Date().toISOString(),
        ticketId,
        assigneeId: updated.assigneeId,
        previousAssigneeId: current.assigneeId,
      });
    }

    return updated;
  },

  /** Applies the same patch to many tickets — reuses `update()` per ticket so outbox/audit logic stays in one place. */
  async bulkUpdate(orgId: string, actorId: string, input: BulkUpdateTicketsInput) {
    const { ticketIds, ...patch } = input;
    const results: { ticketId: string; success: boolean; error?: string }[] = [];

    for (const ticketId of ticketIds) {
      try {
        await this.update(orgId, ticketId, patch, actorId);
        results.push({ ticketId, success: true });
      } catch (err) {
        logger.error({ err, ticketId }, "Bulk ticket update failed for one ticket");
        results.push({ ticketId, success: false, error: err instanceof AppError ? err.message : "Update failed" });
      }
    }

    return results;
  },

  async addMessage(orgId: string, ticketId: string, authorId: string, input: CreateMessageInput) {
    await this.assertExists(orgId, ticketId);

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId,
        authorType: "agent",
        authorId,
        body: input.body,
        bodyFormat: input.bodyFormat,
        isInternalNote: input.isInternalNote,
      },
    });

    if (!input.isInternalNote) {
      // Fire-and-forget: a slow SLA update shouldn't delay the reply response.
      void slaService.markFirstResponse(ticketId);
    }

    return message;
  },

  async getAiSuggestion(orgId: string, ticketId: string) {
    await this.assertExists(orgId, ticketId);
    const messages = await buildAiMessageHistory(ticketId);
    try {
      return await aiClient.suggestReply({ orgId, ticketId, messages });
    } catch (err) {
      logger.error({ err, ticketId }, "AI suggestion request failed");
      throw AppError.internal("Couldn't get an AI suggestion right now. Try again shortly.");
    }
  },

  /** Other open conversations from the same customer — Feature 12's "related tickets." */
  async getRelatedTickets(orgId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId }, select: { customerId: true } });
    if (!ticket) throw AppError.notFound("Ticket not found");

    return prisma.ticket.findMany({
      where: { orgId, customerId: ticket.customerId, id: { not: ticketId } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, number: true, subject: true, status: true, createdAt: true },
    });
  },

  /** Outbound-email delivery history for this ticket (acknowledgement + status updates) — Feature 12's "notification history." */
  async getNotifications(orgId: string, ticketId: string) {
    await this.assertExists(orgId, ticketId);
    return prisma.emailOutboxEvent.findMany({
      where: { orgId, ticketId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Ticket-scoped slice of the audit log — gated by the view_audit_logs permission at the route level. */
  async getAuditHistory(orgId: string, ticketId: string) {
    await this.assertExists(orgId, ticketId);
    return prisma.auditLog.findMany({
      where: { orgId, targetType: "ticket", targetId: ticketId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Mints a fresh customer tracking link on demand (Feature 9's tracking-link controls). */
  async regenerateTrackingLink(orgId: string, ticketId: string) {
    await this.assertExists(orgId, ticketId);
    const { rawToken } = await ticketTrackingService.createToken(ticketId);
    return { trackingUrl: `${env.NEXT_PUBLIC_APP_URL}/ticket-track/${rawToken}` };
  },

  async assertExists(orgId: string, ticketId: string) {
    const exists = await prisma.ticket.findFirst({ where: { id: ticketId, orgId }, select: { id: true } });
    if (!exists) throw AppError.notFound("Ticket not found");
  },
};
