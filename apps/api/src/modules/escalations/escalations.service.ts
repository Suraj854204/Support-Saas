import type { Prisma } from "@prisma/client";

import { assessSeverity, CONTACT_WINDOW_HOURS, type Severity } from "./severity";

import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ticketsService } from "@/modules/tickets/tickets.service";

export type ContactMethod = "call" | "message";
const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 } as const;
type Priority = keyof typeof PRIORITY_RANK;

export function raisedPriority(current: Priority, level: "high" | "critical"): Priority | null {
  const target: Priority = level === "critical" ? "urgent" : "high";
  return PRIORITY_RANK[target] > PRIORITY_RANK[current] ? target : null;
}

export function dueAt(from: Date, hours = CONTACT_WINDOW_HOURS): Date {
  return new Date(from.getTime() + hours * 3600_000);
}

export type EscalationState = "open" | "overdue" | "done" | "all";

export const escalationsService = {
  /**
   * Checks a customer's text and, when it is serious, escalates the ticket:
   * priority is raised (never lowered), tagged, and a 24-hour "contact the client"
   * deadline is created. Never throws: it must not break ticket creation.
   */
  async evaluate(params: { orgId: string; ticketId: string; text: string; preferredMethod?: ContactMethod | null; severity?: Severity }) {
    try {
      const severity = params.severity ?? assessSeverity(params.text);
      if (severity.level === "none") return null;
      return await escalationsService.escalate(params.orgId, params.ticketId, {
        level: severity.level,
        reasons: severity.reasons,
        preferredMethod: params.preferredMethod ?? null,
        actorId: null,
      });
    } catch (err) {
      logger.error({ err, ticketId: params.ticketId }, "Escalation check failed (ticket kept as is)");
      return null;
    }
  },

  async escalate(
    orgId: string,
    ticketId: string,
    input: { level: "high" | "critical"; reasons: string[]; preferredMethod: ContactMethod | null; actorId: string | null }
  ) {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId }, include: { escalation: true } });
    if (!ticket) throw AppError.notFound("Ticket not found");

    const existing = ticket.escalation;
    const level = existing?.level === "critical" || input.level === "critical" ? "critical" : "high";
    const reasons = [...new Set([...(existing?.reasons ?? []), ...input.reasons])];

    const escalation = await prisma.ticketEscalation.upsert({
      where: { ticketId },
      create: {
        orgId,
        ticketId,
        level,
        reasons,
        contactDueAt: dueAt(new Date()),
        preferredMethod: input.preferredMethod,
      },
      // A second flag keeps the original deadline: the clock never restarts.
      update: { level, reasons, ...(input.preferredMethod && { preferredMethod: input.preferredMethod }) },
    });

    const update: { priority?: Priority; tags?: string[] } = {};
    const priority = raisedPriority(ticket.priority as Priority, level);
    if (priority) update.priority = priority;
    const tags = [...new Set([...ticket.tags, "escalated"])];
    if (tags.length !== ticket.tags.length) update.tags = tags;
    if (Object.keys(update).length > 0) await ticketsService.update(orgId, ticketId, update, input.actorId ?? undefined);

    if (!existing) {
      await prisma.ticketMessage.create({
        data: {
          ticketId,
          authorType: "system",
          body: `Escalated (${level}). Contact the customer by call or message before ${escalation.contactDueAt.toISOString()}.\nWhy: ${reasons.join("; ")}`,
          isInternalNote: true,
        },
      });
      await recordAudit({
        orgId,
        actorId: input.actorId ?? "system",
        action: "ticket.escalated",
        targetType: "ticket",
        targetId: ticketId,
        metadata: { level, reasons },
      });
    }
    return escalation;
  },

  async logContact(orgId: string, id: string, userId: string, input: { method: ContactMethod; note?: string }) {
    const esc = await prisma.ticketEscalation.findFirst({ where: { id, orgId } });
    if (!esc) throw AppError.notFound("Escalation not found");
    if (esc.contactedAt) throw AppError.conflict("This customer was already contacted");

    const updated = await prisma.ticketEscalation.update({
      where: { id },
      data: { contactedAt: new Date(), contactMethod: input.method, contactedById: userId, contactNote: input.note ?? null },
    });
    await prisma.ticketMessage.create({
      data: {
        ticketId: esc.ticketId,
        authorType: "system",
        authorId: null,
        body: `Customer contacted by ${input.method === "call" ? "call" : "message"}.${input.note ? ` Note: ${input.note}` : ""}`,
        isInternalNote: true,
      },
    });
    await recordAudit({ orgId, actorId: userId, action: "escalation.contacted", targetType: "ticket", targetId: esc.ticketId, metadata: { method: input.method } });
    return updated;
  },

  async list(orgId: string, state: EscalationState, now = new Date()) {
    const where: Prisma.TicketEscalationWhereInput = {
      orgId,
      ...(state === "open" && { contactedAt: null }),
      ...(state === "overdue" && { contactedAt: null, contactDueAt: { lt: now } }),
      ...(state === "done" && { contactedAt: { not: null } }),
    };
    const rows = await prisma.ticketEscalation.findMany({
      where,
      orderBy: state === "done" ? { contactedAt: "desc" } : { contactDueAt: "asc" },
      take: 100,
      include: {
        ticket: {
          select: {
            id: true,
            number: true,
            subject: true,
            status: true,
            customer: { select: { name: true, email: true, phone: true } },
            messages: { where: { authorType: "customer" }, orderBy: { createdAt: "asc" }, take: 1, select: { body: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      level: r.level,
      reasons: r.reasons,
      contactDueAt: r.contactDueAt,
      preferredMethod: r.preferredMethod,
      contactedAt: r.contactedAt,
      contactMethod: r.contactMethod,
      contactNote: r.contactNote,
      createdAt: r.createdAt,
      overdue: !r.contactedAt && r.contactDueAt < now,
      ticket: {
        id: r.ticket.id,
        number: r.ticket.number,
        subject: r.ticket.subject,
        status: r.ticket.status,
        preview: (r.ticket.messages[0]?.body ?? "").slice(0, 300),
      },
      customer: r.ticket.customer,
    }));
  },

  async summary(orgId: string, now = new Date()) {
    const [pending, overdue] = await Promise.all([
      prisma.ticketEscalation.count({ where: { orgId, contactedAt: null } }),
      prisma.ticketEscalation.count({ where: { orgId, contactedAt: null, contactDueAt: { lt: now } } }),
    ]);
    return { pending, overdue };
  },
};
