import type { Prisma } from "@prisma/client";

import type { CreateMessageInput, CreateTicketInput, ListTicketsQuery, UpdateTicketInput } from "./tickets.schema";

import { aiClient } from "@/lib/ai-client";
import { AppError } from "@/lib/app-error";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

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


export const ticketsService = {
  async create(orgId: string, authorId: string, input: CreateTicketInput) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, orgId },
    });
    if (!customer) throw AppError.notFound("Customer not found in this organization");

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

  async list(orgId: string, query: ListTicketsQuery) {
    const where = {
      orgId,
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.assigneeId && { assigneeId: query.assigneeId }),
      ...(query.search && {
        subject: { contains: query.search, mode: "insensitive" as const },
      }),
    };

    const [items, totalItems] = await prisma.$transaction([
      prisma.ticket.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { customer: true, assignee: true },
      }),
      prisma.ticket.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
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
      },
    });
    if (!ticket) throw AppError.notFound("Ticket not found");
    return ticket;
  },

  async update(orgId: string, ticketId: string, input: UpdateTicketInput) {
    await this.assertExists(orgId, ticketId);

    const resolvedStatuses = new Set(["solved", "closed"]);
    const data: Record<string, unknown> = { ...input };
    if (input.status && resolvedStatuses.has(input.status)) {
      data.resolvedAt = new Date();
    }

    return prisma.ticket.update({ where: { id: ticketId }, data });
  },

  async addMessage(orgId: string, ticketId: string, authorId: string, input: CreateMessageInput) {
    await this.assertExists(orgId, ticketId);

    return prisma.ticketMessage.create({
      data: {
        ticketId,
        authorType: "agent",
        authorId,
        body: input.body,
        bodyFormat: input.bodyFormat,
        isInternalNote: input.isInternalNote,
      },
    });
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

  async assertExists(orgId: string, ticketId: string) {
    const exists = await prisma.ticket.findFirst({ where: { id: ticketId, orgId }, select: { id: true } });
    if (!exists) throw AppError.notFound("Ticket not found");
  },
};
