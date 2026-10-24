import { randomUUID } from "node:crypto";

import type { WebhookEndpoint } from "@prisma/client";

import { assertSafeWebhookUrl } from "./url-guard";
import { attemptDelivery } from "./webhook-delivery.service";
import { WEBHOOK_TEST_EVENT, buildEnvelope, isWebhookEventType } from "./webhook-events";
import type { CreateWebhookInput, UpdateWebhookInput } from "./webhooks.schema";

import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { generateRawToken } from "@/lib/security";

const MAX_ENDPOINTS_PER_ORG = 20;

/** Endpoint as exposed over the API — the encrypted secret never leaves the server. */
export function toPublicEndpoint(endpoint: WebhookEndpoint) {
  const { secretEncrypted, ...rest } = endpoint;
  void secretEncrypted;
  return rest;
}

function newSecret(): string {
  return `whsec_${generateRawToken(24)}`;
}

async function getEndpointOrThrow(orgId: string, id: string) {
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, orgId } });
  if (!endpoint) throw AppError.notFound("Webhook endpoint not found");
  return endpoint;
}

export const webhooksService = {
  async list(orgId: string) {
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
    return endpoints.map(toPublicEndpoint);
  },

  /** Returns the signing secret exactly once — it is stored encrypted and cannot be read back. */
  async create(orgId: string, userId: string, input: CreateWebhookInput) {
    const count = await prisma.webhookEndpoint.count({ where: { orgId } });
    if (count >= MAX_ENDPOINTS_PER_ORG) {
      throw AppError.validation(`You can have at most ${MAX_ENDPOINTS_PER_ORG} webhook endpoints`);
    }

    await assertSafeWebhookUrl(input.url);

    const secret = newSecret();
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        orgId,
        url: input.url,
        description: input.description ?? null,
        format: input.format,
        events: input.events,
        secretEncrypted: encryptSecret(secret),
        createdById: userId,
      },
    });

    await recordAudit({
      orgId,
      actorId: userId,
      action: "webhook.created",
      targetType: "webhook_endpoint",
      targetId: endpoint.id,
      metadata: { url: endpoint.url, format: endpoint.format },
    });

    return { endpoint: toPublicEndpoint(endpoint), secret };
  },

  async update(orgId: string, userId: string, id: string, input: UpdateWebhookInput) {
    const existing = await getEndpointOrThrow(orgId, id);

    if (input.url && input.url !== existing.url) await assertSafeWebhookUrl(input.url);

    const updated = await prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...input,
        // Re-enabling clears the reason an endpoint was switched off.
        ...(input.isActive === true && { disabledReason: null }),
      },
    });

    await recordAudit({
      orgId,
      actorId: userId,
      action: "webhook.updated",
      targetType: "webhook_endpoint",
      targetId: id,
      metadata: { fields: Object.keys(input) },
    });

    return toPublicEndpoint(updated);
  },

  async remove(orgId: string, userId: string, id: string) {
    await getEndpointOrThrow(orgId, id);
    await prisma.webhookEndpoint.delete({ where: { id } });
    await recordAudit({ orgId, actorId: userId, action: "webhook.deleted", targetType: "webhook_endpoint", targetId: id });
  },

  async rotateSecret(orgId: string, userId: string, id: string) {
    await getEndpointOrThrow(orgId, id);
    const secret = newSecret();
    await prisma.webhookEndpoint.update({ where: { id }, data: { secretEncrypted: encryptSecret(secret) } });
    await recordAudit({ orgId, actorId: userId, action: "webhook.secret_rotated", targetType: "webhook_endpoint", targetId: id });
    return { secret };
  },

  /** Sends a `webhook.test` event immediately so the user gets instant success/failure feedback. */
  async sendTest(orgId: string, id: string) {
    const endpoint = await getEndpointOrThrow(orgId, id);
    const eventId = randomUUID();

    const delivery = await prisma.webhookDelivery.create({
      data: {
        orgId,
        endpointId: endpoint.id,
        eventId,
        eventType: WEBHOOK_TEST_EVENT,
        payload: buildEnvelope(WEBHOOK_TEST_EVENT, {
          eventId,
          orgId,
          occurredAt: new Date().toISOString(),
        }) as never,
        // Claimed by this call, not the background worker.
        nextAttemptAt: new Date(Date.now() + 5 * 60_000),
      },
      include: { endpoint: true },
    });

    await attemptDelivery(delivery);

    return prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  },

  async listDeliveries(orgId: string, id: string, limit = 50) {
    await getEndpointOrThrow(orgId, id);
    return prisma.webhookDelivery.findMany({
      where: { orgId, endpointId: id },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      select: {
        id: true,
        eventId: true,
        eventType: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        lastError: true,
        lastStatusCode: true,
        deliveredAt: true,
        createdAt: true,
      },
    });
  },

  /** Puts a dead (or stuck) delivery back in the queue with a fresh attempt budget. */
  async retryDelivery(orgId: string, deliveryId: string) {
    const delivery = await prisma.webhookDelivery.findFirst({ where: { id: deliveryId, orgId } });
    if (!delivery) throw AppError.notFound("Delivery not found");
    if (delivery.status === "delivered") throw AppError.conflict("This delivery already succeeded");

    return prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
  },

  /**
   * Fan-out entry point, called from publishEvent() for every internal event.
   * Creates one queued delivery per matching active endpoint; the worker does
   * the actual sending, so request paths never wait on a customer's server.
   * Never throws — webhooks must not be able to break ticket handling.
   */
  async dispatchFromEvent(
    type: string,
    eventPayload: { eventId: string; orgId: string; occurredAt: string }
  ): Promise<void> {
    // Event interfaces have no index signature; widen once so the extra,
    // per-event fields (messageId, subject, ...) can be read safely.
    const payload = eventPayload as typeof eventPayload & Record<string, unknown>;

    try {
      if (!isWebhookEventType(type)) return;

      const endpoints = await prisma.webhookEndpoint.findMany({
        where: {
          orgId: payload.orgId,
          isActive: true,
          OR: [{ events: { isEmpty: true } }, { events: { has: type } }],
        },
      });
      if (endpoints.length === 0) return;

      // message.sent is published for internal notes too, but its payload
      // carries no flag. Internal notes must never leave the helpdesk, so
      // look the message up and drop the event if it is one.
      if (type === "message.sent" && typeof payload.messageId === "string") {
        const message = await prisma.ticketMessage.findUnique({
          where: { id: payload.messageId },
          select: { isInternalNote: true },
        });
        if (!message || message.isInternalNote) return;
      }

      const envelope = buildEnvelope(type, payload);

      await prisma.webhookDelivery.createMany({
        data: endpoints.map((endpoint) => ({
          orgId: payload.orgId,
          endpointId: endpoint.id,
          eventId: payload.eventId,
          eventType: type,
          payload: envelope as never,
        })),
        skipDuplicates: true,
      });
    } catch (err) {
      logger.warn({ err, type }, "Webhook dispatch failed (best-effort, continuing)");
    }
  },
};
