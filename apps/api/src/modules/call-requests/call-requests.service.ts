import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const OPEN_STATUSES = ["requested", "scheduled"] as const;
export const ALL_STATUSES = ["requested", "scheduled", "completed", "no_answer", "cancelled"] as const;
export type CallStatus = (typeof ALL_STATUSES)[number];

/** Keeps digits and a leading +; accepts 7-15 digits (E.164 length). Returns null for anything else. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\+?[\d\s().-]{7,25}$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

const CUSTOMER_VIEW = { id: true, phone: true, preferredTime: true, status: true, scheduledAt: true, createdAt: true } as const;

export const callRequestsService = {
  /**
   * A visitor asks for a call on their own conversation. One open request per conversation: asking again returns the
   * existing one instead of piling up duplicates.
   */
  async createFromCustomer(orgId: string, customerId: string, ticketId: string, input: { phone: string; preferredTime?: string; note?: string }) {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId, customerId }, select: { id: true, tags: true } });
    if (!ticket) throw AppError.notFound("Conversation not found");
    const phone = normalizePhone(input.phone);
    if (!phone) throw AppError.validation("Please enter a valid phone number, with country code if possible (for example +91 98765 43210).");

    const open = await prisma.callRequest.findFirst({ where: { orgId, ticketId, status: { in: [...OPEN_STATUSES] } }, select: CUSTOMER_VIEW });
    if (open) return { request: open, duplicate: true };

    const request = await prisma.callRequest.create({
      data: {
        orgId,
        ticketId,
        customerId,
        phone,
        preferredTime: input.preferredTime?.trim() || null,
        note: input.note?.trim() || null,
      },
      select: CUSTOMER_VIEW,
    });

    // Staff see it in the conversation and can filter on the tag; the customer's profile gets the number if it had none.
    await prisma.$transaction([
      prisma.ticketMessage.create({
        data: { ticketId, authorType: "system", body: `Call requested: ${phone}${input.preferredTime?.trim() ? ` (${input.preferredTime.trim()})` : ""}` },
      }),
      prisma.ticket.update({ where: { id: ticketId }, data: { tags: ticket.tags.includes("call-request") ? ticket.tags : [...ticket.tags, "call-request"], lastCustomerActivityAt: new Date() } }),
      prisma.customer.updateMany({ where: { id: customerId, orgId, phone: null }, data: { phone } }),
    ]);
    return { request, duplicate: false };
  },

  async list(orgId: string, status: "open" | CallStatus | "all" = "open") {
    const where = { orgId, ...(status === "all" ? {} : status === "open" ? { status: { in: [...OPEN_STATUSES] } } : { status }) };
    return prisma.callRequest.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { ticket: { select: { id: true, number: true, subject: true } } },
    });
  },

  async update(orgId: string, id: string, actorId: string, input: { status?: CallStatus; scheduledAt?: Date | null; assigneeId?: string | null }) {
    const current = await prisma.callRequest.findFirst({ where: { id, orgId } });
    if (!current) throw AppError.notFound("Call request not found");
    if (input.assigneeId) {
      const user = await prisma.user.findFirst({ where: { id: input.assigneeId, orgId, isActive: true }, select: { id: true } });
      if (!user) throw AppError.validation("That person isn't an active member of your organization");
    }
    const closing = input.status && !OPEN_STATUSES.includes(input.status as never);
    const { count } = await prisma.callRequest.updateMany({
      where: { id, orgId },
      data: {
        ...(input.status && { status: input.status }),
        ...(input.scheduledAt !== undefined && { scheduledAt: input.scheduledAt }),
        ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
        ...(closing && { handledAt: new Date() }),
      },
    });
    if (count === 0) throw AppError.notFound("Call request not found");
    await recordAudit({ orgId, actorId, action: "call_request.updated", targetType: "call_request", targetId: id, metadata: { from: current.status, to: input.status ?? current.status } });
    return prisma.callRequest.findFirstOrThrow({ where: { id, orgId }, include: { ticket: { select: { id: true, number: true, subject: true } } } });
  },
};
