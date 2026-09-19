import { v4 as uuid } from "uuid";

import { env } from "@/config/env";
import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { gmailSendService } from "@/modules/email-integrations/gmail-send.service";
import { buildReplySubject, ensureReplyToken } from "@/modules/email-integrations/gmail-thread.service";
import { ticketTrackingService } from "@/modules/ticket-tracking/ticket-tracking.service";
import { ticketStatusTemplate, type StatusTransitionType } from "@/services/email-templates/ticket-status.template";

const POLL_INTERVAL_MS = 15_000;
const MAX_ATTEMPTS = 5;

let intervalHandle: ReturnType<typeof setInterval> | undefined;
let running = false;

interface TicketStatusPayload {
  previousStatus: string;
  newStatus: string;
  transitionType: StatusTransitionType;
}

async function processTicketStatusEvent(orgId: string, ticketId: string, payload: TicketStatusPayload) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { customer: true } });
  if (!ticket) throw new Error("Ticket no longer exists");
  if (!ticket.customer.email) throw new Error("Customer has no email on file");

  const connection = await prisma.emailConnection.findFirst({ where: { orgId, isActive: true } });
  if (!connection) throw new Error("No active Gmail connection for this organization");

  const latestPublicReply = await prisma.ticketMessage.findFirst({
    where: { ticketId, isInternalNote: false, authorType: "agent" },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  const { rawToken } = await ticketTrackingService.createToken(ticketId);
  const trackingUrl = `${env.NEXT_PUBLIC_APP_URL}/ticket-track/${rawToken}`;
  const replyToken = await ensureReplyToken(ticketId);

  const { subject, text, html } = ticketStatusTemplate({
    ticketNumber: `SUP-${ticket.number}`,
    subject: ticket.subject,
    previousStatus: payload.previousStatus,
    newStatus: payload.newStatus,
    transitionType: payload.transitionType,
    trackingUrl,
    organizationName: org?.name ?? "Support",
    latestPublicReply: latestPublicReply?.body ?? null,
  });

  const result = await gmailSendService.sendReply({
    connection,
    ticketId,
    to: ticket.customer.email,
    subject: buildReplySubject(ticket.number, subject),
    textBody: text,
    htmlBody: html,
    threadId: ticket.gmailThreadId ?? undefined,
    replyToken,
    isAutomated: true,
  });

  if (!result.delivered) {
    throw new Error(result.error ?? "Unknown Gmail send error");
  }
}

async function processEvent(event: {
  id: string;
  orgId: string;
  eventType: string;
  ticketId: string | null;
  payload: unknown;
  attempts: number;
}) {
  await prisma.emailOutboxEvent.update({ where: { id: event.id }, data: { status: "processing" } });

  try {
    if (event.eventType === "ticket.status.updated" && event.ticketId) {
      await processTicketStatusEvent(event.orgId, event.ticketId, event.payload as TicketStatusPayload);
    } else {
      throw new Error(`No handler for outbox event type "${event.eventType}"`);
    }

    await prisma.emailOutboxEvent.update({
      where: { id: event.id },
      data: { status: "sent", processedAt: new Date(), lastError: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown outbox processing error";
    const attempts = event.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;

    logger.error({ err, eventId: event.id, attempts }, "Failed to process email outbox event");

    await prisma.emailOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: exhausted ? "failed" : "pending",
        attempts,
        lastError: message,
        processedAt: exhausted ? new Date() : null,
      },
    });

    if (exhausted) {
      void publishEvent(KAFKA_TOPICS.EMAIL_DELIVERY_FAILED, {
        eventId: uuid(),
        orgId: event.orgId,
        occurredAt: new Date().toISOString(),
        ticketId: event.ticketId,
        outboxEventId: event.id,
        reason: message,
      });
    }
  }
}

async function pollOutbox() {
  if (running) return;
  running = true;

  try {
    const events = await prisma.emailOutboxEvent.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    for (const event of events) {
      await processEvent(event);
    }
  } catch (err) {
    logger.error({ err }, "Email outbox poll failed");
  } finally {
    running = false;
  }
}

export function startEmailOutboxWorker(): void {
  intervalHandle = setInterval(() => void pollOutbox(), POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Email outbox worker started");
}

export function stopEmailOutboxWorker(): void {
  if (intervalHandle) clearInterval(intervalHandle);
}
