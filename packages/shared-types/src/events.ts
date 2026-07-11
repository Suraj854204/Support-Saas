// ============================================================================
// Kafka event contracts. Topic names are namespaced `<domain>.<event>`.
// The API service is the producer of the ticket.* and message.* topics;
// the AI service consumes them and produces ai.* topics back.
// ============================================================================

export const KAFKA_TOPICS = {
  TICKET_CREATED: "ticket.created",
  TICKET_UPDATED: "ticket.updated",
  TICKET_ASSIGNED: "ticket.assigned",
  MESSAGE_SENT: "message.sent",
  AI_SUGGESTION_REQUESTED: "ai.suggestion.requested",
  AI_SUGGESTION_READY: "ai.suggestion.ready",
  AI_SENTIMENT_ANALYZED: "ai.sentiment.analyzed",
  KB_ARTICLE_UPSERTED: "kb.article.upserted",
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

interface BaseEvent {
  eventId: string;
  orgId: string;
  occurredAt: string;
}

export interface TicketCreatedEvent extends BaseEvent {
  ticketId: string;
  customerId: string;
  channel: string;
  subject: string;
}

export interface TicketUpdatedEvent extends BaseEvent {
  ticketId: string;
  changedFields: string[];
  status?: string;
}

export interface MessageSentEvent extends BaseEvent {
  ticketId: string;
  messageId: string;
  authorType: "customer" | "agent" | "ai" | "system";
  body: string;
}

export interface AiSuggestionRequestedEvent extends BaseEvent {
  ticketId: string;
  messageId: string;
}

export interface AiSuggestionReadyEvent extends BaseEvent {
  ticketId: string;
  suggestionId: string;
  confidence: number;
}

export type KafkaEventPayloadMap = {
  [KAFKA_TOPICS.TICKET_CREATED]: TicketCreatedEvent;
  [KAFKA_TOPICS.TICKET_UPDATED]: TicketUpdatedEvent;
  [KAFKA_TOPICS.TICKET_ASSIGNED]: TicketUpdatedEvent;
  [KAFKA_TOPICS.MESSAGE_SENT]: MessageSentEvent;
  [KAFKA_TOPICS.AI_SUGGESTION_REQUESTED]: AiSuggestionRequestedEvent;
  [KAFKA_TOPICS.AI_SUGGESTION_READY]: AiSuggestionReadyEvent;
  [KAFKA_TOPICS.AI_SENTIMENT_ANALYZED]: BaseEvent & { ticketId: string; sentiment: string };
  [KAFKA_TOPICS.KB_ARTICLE_UPSERTED]: BaseEvent & { articleId: string };
};
