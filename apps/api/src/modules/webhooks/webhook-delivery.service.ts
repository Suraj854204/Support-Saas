import http from "node:http";
import https from "node:https";

import type { WebhookDelivery, WebhookEndpoint } from "@prisma/client";

import { signPayload } from "./signing";
import { guardedLookup } from "./url-guard";
import { WEBHOOK_TEST_EVENT, formatSlackMessage, type WebhookEnvelope } from "./webhook-events";

import { decryptSecret } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const MAX_DELIVERY_ATTEMPTS = 8;
export const REQUEST_TIMEOUT_MS = 8_000;

/** Seconds to wait before retry N (index 0 = after the 1st failure). Last value repeats. */
const BACKOFF_SECONDS: readonly number[] = [30, 120, 600, 1800, 3600, 10_800, 21_600];
const MAX_BACKOFF_SECONDS = 21_600;

export function backoffSeconds(attemptsMade: number): number {
  const idx = Math.min(Math.max(attemptsMade - 1, 0), BACKOFF_SECONDS.length - 1);
  return BACKOFF_SECONDS[idx] ?? MAX_BACKOFF_SECONDS;
}

export interface HttpPostResult {
  statusCode: number;
  bodySnippet: string;
}

/**
 * POSTs a JSON body using node:http(s) rather than fetch so the DNS `lookup`
 * can be pinned to the validated address (see url-guard.ts). Redirects are
 * deliberately not followed: a 3xx would let a public host bounce us to an
 * internal one.
 */
export function postJson(
  url: URL,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<HttpPostResult> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;

    const req = transport.request(
      url,
      {
        method: "POST",
        lookup: guardedLookup as never,
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body).toString(),
          "User-Agent": "SupportSaaS-Webhooks/1.0",
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;

        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= 2048) chunks.push(chunk);
          if (size > 8192) res.destroy(); // never buffer an unbounded response
        });
        const finish = () =>
          resolve({ statusCode: res.statusCode ?? 0, bodySnippet: Buffer.concat(chunks).toString("utf8").slice(0, 300) });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", reject);
      }
    );

    req.on("timeout", () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

type DeliveryWithEndpoint = WebhookDelivery & { endpoint: WebhookEndpoint };

function buildBody(endpoint: WebhookEndpoint, envelope: WebhookEnvelope): string {
  return JSON.stringify(endpoint.format === "slack" ? formatSlackMessage(envelope) : envelope);
}

/**
 * Makes one delivery attempt and records the outcome. Never throws: every
 * failure becomes a retry schedule (or a terminal `dead` status) on the row.
 */
export async function attemptDelivery(delivery: DeliveryWithEndpoint): Promise<void> {
  const { endpoint } = delivery;
  const attemptNumber = delivery.attempts + 1;

  if (!endpoint.isActive) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "dead", attempts: attemptNumber, lastError: "Endpoint is disabled" },
    });
    return;
  }

  let statusCode: number | null = null;
  let error: string | null = null;

  try {
    const envelope = delivery.payload as unknown as WebhookEnvelope;
    const body = buildBody(endpoint, envelope);
    const secret = decryptSecret(endpoint.secretEncrypted);
    const { header } = signPayload(secret, body);

    const result = await postJson(new URL(endpoint.url), body, {
      "X-Support-Signature": header,
      "X-Support-Event": delivery.eventType,
      "X-Support-Delivery": delivery.id,
    });

    statusCode = result.statusCode;
    if (result.statusCode < 200 || result.statusCode >= 300) {
      error = `Endpoint responded with HTTP ${result.statusCode}${result.bodySnippet ? `: ${result.bodySnippet}` : ""}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown delivery error";
  }

  if (!error) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "delivered", attempts: attemptNumber, deliveredAt: new Date(), lastStatusCode: statusCode, lastError: null },
    });
    return;
  }

  // 410 Gone is the receiver telling us the endpoint no longer exists —
  // stop retrying and switch the endpoint off instead of hammering it.
  if (statusCode === 410) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "dead", attempts: attemptNumber, lastStatusCode: statusCode, lastError: error },
      }),
      prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { isActive: false, disabledReason: "Endpoint returned 410 Gone" },
      }),
    ]);
    return;
  }

  // "Send test event" is a one-shot probe: report the failure, don't queue retries for it.
  const exhausted = attemptNumber >= MAX_DELIVERY_ATTEMPTS || delivery.eventType === WEBHOOK_TEST_EVENT;

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      attempts: attemptNumber,
      lastStatusCode: statusCode,
      lastError: error.slice(0, 500),
      status: exhausted ? "dead" : "pending",
      nextAttemptAt: exhausted ? delivery.nextAttemptAt : new Date(Date.now() + backoffSeconds(attemptNumber) * 1000),
    },
  });

  logger.warn(
    { deliveryId: delivery.id, endpointId: endpoint.id, attempt: attemptNumber, exhausted, statusCode },
    "Webhook delivery failed"
  );
}
