import { KAFKA_TOPICS, type TicketCreatedEvent, type TicketUpdatedEvent } from "@support-saas/shared-types";
import { Kafka, logLevel, type Consumer } from "kafkajs";

import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

const CONSUMER_GROUP = "analytics-consumer";
const COUNTER_TTL_SECONDS = 60 * 60 * 24 * 400; // ~13 months of daily buckets

let consumer: Consumer | undefined;

const kafka = new Kafka({
  clientId: "support-saas-analytics",
  brokers: env.KAFKA_BROKERS.split(","),
  logLevel: logLevel.NOTHING,
  retry: { retries: 3 },
});

function dateKey(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10); // YYYY-MM-DD
}

export function createdCounterKey(orgId: string, date: string): string {
  return `analytics:created:${orgId}:${date}`;
}

export function resolvedCounterKey(orgId: string, date: string): string {
  return `analytics:resolved:${orgId}:${date}`;
}

async function handleTicketCreated(event: TicketCreatedEvent) {
  const key = createdCounterKey(event.orgId, dateKey(event.occurredAt));
  await redis.incr(key);
  await redis.expire(key, COUNTER_TTL_SECONDS);
}

async function handleTicketUpdated(event: TicketUpdatedEvent) {
  const wasResolved =
    event.changedFields.includes("status") && (event.status === "solved" || event.status === "closed");
  if (!wasResolved) return;

  const key = resolvedCounterKey(event.orgId, dateKey(event.occurredAt));
  await redis.incr(key);
  await redis.expire(key, COUNTER_TTL_SECONDS);
}

export async function startAnalyticsConsumer(): Promise<void> {
  if (!env.KAFKA_ENABLED) return;

  try {
    consumer = kafka.consumer({ groupId: CONSUMER_GROUP });
    await consumer.connect();
    await consumer.subscribe({
      topics: [KAFKA_TOPICS.TICKET_CREATED, KAFKA_TOPICS.TICKET_UPDATED],
      fromBeginning: false,
    });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;

        try {
          const payload = JSON.parse(message.value.toString());
          if (topic === KAFKA_TOPICS.TICKET_CREATED) {
            await handleTicketCreated(payload as TicketCreatedEvent);
          } else if (topic === KAFKA_TOPICS.TICKET_UPDATED) {
            await handleTicketUpdated(payload as TicketUpdatedEvent);
          }
        } catch (err) {
          logger.error({ err, topic }, "Failed to process analytics event");
        }
      },
    });

    logger.info("Analytics Kafka consumer running");
  } catch (err) {
    logger.warn({ err }, "Analytics consumer failed to start — dashboard volume chart will show zeros");
  }
}

export async function stopAnalyticsConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect().catch(() => undefined);
  }
}
