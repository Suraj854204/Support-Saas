import { v4 as uuid } from "uuid";

import { gmailSendService } from "./gmail-send.service";
import { buildReplySubject, ensureReplyToken } from "./gmail-thread.service";

import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

interface OutboundCandidateMessage {
  id: string;
  ticketId: string;
  authorType: string;
  isInternalNote: boolean;
  body: string;
}

/**
 * No-op unless this message is exactly the case Feature 8 describes: a
 * non-internal agent reply on an email-channel ticket. Never throws —
 * a Gmail send failure is logged and published as an event, not surfaced
 * as an API error for the (already-successful) message-creation request.
 */
export async function sendAgentReplyEmailIfNeeded(orgId: string, message: OutboundCandidateMessage): Promise<void> {
  if (message.isInternalNote || message.authorType !== "agent") return;

  const ticket = await prisma.ticket.findUnique({
    where: { id: message.ticketId },
    include: { customer: true },
  });
  if (!ticket || ticket.channel !== "email" || !ticket.customer.email) return;

  const connection = await prisma.emailConnection.findFirst({ where: { orgId, isActive: true } });
  if (!connection) {
    logger.warn({ ticketId: ticket.id }, "Agent reply not emailed — no active Gmail connection for this org");
    return;
  }

  const lastInbound = await prisma.inboundEmailMessage.findFirst({
    where: { ticketId: ticket.id },
    orderBy: { receivedAt: "desc" },
  });

  const replyToken = await ensureReplyToken(ticket.id);

  const result = await gmailSendService.sendReply({
    connection,
    ticketId: ticket.id,
    to: ticket.customer.email,
    subject: buildReplySubject(ticket.number, ticket.subject),
    textBody: message.body,
    threadId: ticket.gmailThreadId ?? undefined,
    inReplyTo: lastInbound?.internetMessageId ?? undefined,
    replyToken,
    isAutomated: false, // a human agent wrote this — no auto-response headers
  });

  if (!result.delivered) {
    logger.warn({ ticketId: ticket.id, error: result.error }, "Agent reply email failed to send");
    void publishEvent(KAFKA_TOPICS.EMAIL_DELIVERY_FAILED, {
      eventId: uuid(),
      orgId,
      occurredAt: new Date().toISOString(),
      ticketId: ticket.id,
      outboxEventId: "n/a",
      reason: result.error ?? "unknown",
    });
    return;
  }

  if (result.gmailThreadId && result.gmailThreadId !== ticket.gmailThreadId) {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { gmailThreadId: result.gmailThreadId } });
  }
}
