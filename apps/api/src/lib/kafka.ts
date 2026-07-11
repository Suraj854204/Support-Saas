import { KAFKA_TOPICS, type KafkaEventPayloadMap } from "@support-saas/shared-types";
import { Kafka, logLevel, type Producer } from "kafkajs";

import { env } from "@/config/env";
import { logger } from "@/lib/logger";

let producer: Producer | undefined;
let connected = false;

const kafka = new Kafka({
  clientId: "support-saas-api",
  brokers: env.KAFKA_BROKERS.split(","),
  logLevel: logLevel.NOTHING,
  retry: { retries: 3 },
});

export async function connectProducer(): Promise<void> {
  if (!env.KAFKA_ENABLED || connected) return;

  try {
    producer = kafka.producer();
    await producer.connect();
    connected = true;
    logger.info("Kafka producer connected");
  } catch (err) {
    logger.warn({ err }, "Kafka producer failed to connect — publishing will be a no-op");
  }
}

export async function disconnectProducer(): Promise<void> {
  if (producer && connected) {
    await producer.disconnect().catch(() => undefined);
    connected = false;
  }
}

/**
 * Publishes a strongly-typed event to its Kafka topic. Fire-and-forget by
 * design: analytics/audit consumers are never allowed to be a dependency
 * of the request path that creates/updates a ticket.
 */
export async function publishEvent<T extends keyof KafkaEventPayloadMap>(
  topic: T,
  payload: KafkaEventPayloadMap[T]
): Promise<void> {
  if (!env.KAFKA_ENABLED || !producer || !connected) return;

  try {
    await producer.send({
      topic,
      messages: [{ key: payload.orgId, value: JSON.stringify(payload) }],
    });
  } catch (err) {
    logger.warn({ err, topic }, "Kafka publish failed (best-effort, continuing)");
  }
}

export { KAFKA_TOPICS };
