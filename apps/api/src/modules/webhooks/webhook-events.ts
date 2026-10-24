import { KAFKA_TOPICS } from "@support-saas/shared-types";

/**
 * The public webhook event catalogue. Event names deliberately reuse the
 * existing internal event topics (ticket.created, message.sent, ...) so
 * there is exactly one vocabulary across Kafka and webhooks. AI and email
 * delivery-failure topics stay internal.
 */
export const WEBHOOK_EVENT_TYPES = [
  KAFKA_TOPICS.TICKET_CREATED,
  KAFKA_TOPICS.TICKET_UPDATED,
  KAFKA_TOPICS.TICKET_ASSIGNED,
  KAFKA_TOPICS.TICKET_RESOLVED,
  KAFKA_TOPICS.MESSAGE_SENT,
  KAFKA_TOPICS.CUSTOMER_REPLY_RECEIVED,
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Sent by the "send test event" button; never subscribable, always deliverable on request. */
export const WEBHOOK_TEST_EVENT = "webhook.test";

export function isWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

export interface WebhookEnvelope {
  id: string;
  type: string;
  createdAt: string;
  orgId: string;
  data: Record<string, unknown>;
}

/** Wraps an internal event payload in the stable public envelope. */
export function buildEnvelope(type: string, payload: { eventId: string; orgId: string; occurredAt: string }): WebhookEnvelope {
  const { eventId, orgId, occurredAt, ...data } = payload as typeof payload & Record<string, unknown>;
  return { id: eventId, type, createdAt: occurredAt, orgId, data };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Slack requires &, < and > to be escaped so user text can't inject links or mentions. */
function slackEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Plain-text Slack incoming-webhook body for an envelope. */
export function formatSlackMessage(envelope: WebhookEnvelope): { text: string } {
  const d = envelope.data;
  const ticket = slackEscape(str(d.ticketId, "unknown"));

  switch (envelope.type) {
    case KAFKA_TOPICS.TICKET_CREATED:
      return {
        text: `:ticket: New ticket created: "${slackEscape(truncate(str(d.subject, "(no subject)"), 120))}" via ${slackEscape(
          str(d.channel, "unknown")
        )} (${ticket})`,
      };
    case KAFKA_TOPICS.TICKET_UPDATED: {
      const fields = Array.isArray(d.changedFields) ? d.changedFields.map(String).join(", ") : "";
      return { text: `:pencil2: Ticket ${ticket} updated${fields ? ` (${slackEscape(fields)})` : ""}` };
    }
    case KAFKA_TOPICS.TICKET_ASSIGNED:
      return { text: `:bust_in_silhouette: Ticket ${ticket} ${d.assigneeId ? "was assigned" : "was unassigned"}` };
    case KAFKA_TOPICS.TICKET_RESOLVED:
      return { text: `:white_check_mark: Ticket ${ticket} marked ${slackEscape(str(d.status, "resolved"))}` };
    case KAFKA_TOPICS.MESSAGE_SENT:
      return {
        text: `:speech_balloon: New ${slackEscape(str(d.authorType, "unknown"))} message on ticket ${ticket}: ${slackEscape(
          truncate(str(d.body), 200)
        )}`,
      };
    case KAFKA_TOPICS.CUSTOMER_REPLY_RECEIVED:
      return { text: `:email: Customer replied by email on ticket ${ticket}` };
    case WEBHOOK_TEST_EVENT:
      return { text: ":white_check_mark: Test event from Support SaaS — your webhook is connected." };
    default:
      return { text: `Event ${slackEscape(envelope.type)}` };
  }
}
