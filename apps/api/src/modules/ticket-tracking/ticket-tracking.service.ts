import { v4 as uuid } from "uuid";

import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { prisma } from "@/lib/prisma";
import { generateRawToken, hashToken } from "@/lib/security";
import { automationEngine } from "@/modules/automations/automation-engine.service";
import { emitToOrg, emitToTicket } from "@/sockets";

export interface PublicTrackingMessage {
  id: string;
  authorType: "customer" | "agent";
  body: string;
  createdAt: string;
}

export interface PublicTicketTracking {
  ticketNumber: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  timeline: PublicTrackingMessage[];
}

/** Resolves a raw token to its (non-revoked, non-expired) record, or null. Shared by every token-gated lookup below. */
async function resolveActiveToken(rawToken: string) {
  const record = await prisma.ticketTrackingToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record || record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;
  return record;
}

export const ticketTrackingService = {
  /** Mints a new tracking token for a ticket. Returns the raw token exactly once — only its hash is stored. */
  async createToken(ticketId: string): Promise<{ rawToken: string }> {
    const rawToken = generateRawToken(32);
    await prisma.ticketTrackingToken.create({
      data: { ticketId, tokenHash: hashToken(rawToken) },
    });
    return { rawToken };
  },

  /**
   * Resolves a raw token to a customer-safe ticket view, or null for any
   * invalid/expired/revoked token — callers should turn null into a generic
   * "not found" response, never distinguishing *why* it failed.
   */
  async getByToken(rawToken: string): Promise<PublicTicketTracking | null> {
    const record = await resolveActiveToken(rawToken);
    if (!record) return null;

    const ticket = await prisma.ticket.findUnique({
      where: { id: record.ticketId },
      include: {
        organization: { select: { name: true, logoUrl: true } },
        messages: { where: { isInternalNote: false }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) return null;

    await prisma.ticketTrackingToken.update({
      where: { id: record.id },
      data: { lastOpenedAt: new Date(), openCount: { increment: 1 } },
    });

    return {
      ticketNumber: `SUP-${ticket.number}`,
      organizationName: ticket.organization.name,
      organizationLogoUrl: ticket.organization.logoUrl,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      timeline: ticket.messages.map((m) => ({
        id: m.id,
        authorType: m.authorType === "customer" ? "customer" : "agent",
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  },

  /**
   * A customer reply submitted directly from the tracking page — feeds
   * into the same conversation/threading pipeline as an emailed reply
   * (Feature 8), just without any Gmail-side matching since the token
   * already ties it to an exact ticket. Returns null for the same
   * invalid/expired/revoked cases getByToken does.
   */
  async submitReply(rawToken: string, body: string): Promise<PublicTicketTracking | null> {
    const record = await resolveActiveToken(rawToken);
    if (!record) return null;

    const ticket = await prisma.ticket.findUnique({ where: { id: record.ticketId } });
    if (!ticket) return null;

    const message = await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorType: "customer", authorId: null, body },
    });

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { lastCustomerActivityAt: new Date() },
    });

    emitToTicket(ticket.id, "ticket:message", message);
    emitToOrg(ticket.orgId, "ticket:message", { ticketId: ticket.id, message });
    void publishEvent(KAFKA_TOPICS.MESSAGE_SENT, {
      eventId: uuid(),
      orgId: ticket.orgId,
      occurredAt: new Date().toISOString(),
      ticketId: ticket.id,
      messageId: message.id,
      authorType: "customer",
      body: message.body,
    });
    void automationEngine.run(ticket.orgId, "customer_replied", updatedTicket, { messageText: body });

    return this.getByToken(rawToken);
  },
};
