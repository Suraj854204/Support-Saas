import crypto from "node:crypto";

import type { ApiResponse } from "@support-saas/shared-types";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { v4 as uuid } from "uuid";

import {
  publicAddMessageSchema,
  publicCreateTicketSchema,
  publicListTicketsQuerySchema,
  publicTicketIdParamSchema,
} from "./public-api.schema";
import { publicApiService, toPublicTicket } from "./public-api.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { extractApiKey, requireApiKey } from "@/middleware/api-key.middleware";
import { validate } from "@/middleware/validate.middleware";
import { emitToOrg, emitToTicket, emitToTicketWidgetRoom } from "@/sockets";

/**
 * Per-API-key limiter (falls back to per-IP when no key was presented), so
 * one integration looping on errors can't starve the others or the dashboard.
 */
const publicApiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const key = extractApiKey(req);
    return key ? `k:${crypto.createHash("sha256").update(key).digest("hex").slice(0, 32)}` : `ip:${req.ip ?? "unknown"}`;
  },
  handler: (_req, _res, next) => next(AppError.rateLimited("API rate limit exceeded (120 requests/minute per key)")),
});

export const publicApiRouter = Router();

publicApiRouter.use(publicApiLimiter);

publicApiRouter.post(
  "/tickets",
  requireApiKey("tickets:write"),
  validate({ body: publicCreateTicketSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId, keyId } = req.apiKey as NonNullable<Request["apiKey"]>;

    const ticket = await publicApiService.createTicket(orgId, keyId, req.body);

    // Same fan-out as a dashboard-created ticket: live inbox update + event
    // bus (which in turn feeds outgoing webhooks).
    emitToOrg(orgId, "ticket:created", ticket);
    void publishEvent(KAFKA_TOPICS.TICKET_CREATED, {
      eventId: uuid(),
      orgId,
      occurredAt: new Date().toISOString(),
      ticketId: ticket.id,
      customerId: ticket.customerId,
      channel: ticket.channel,
      subject: ticket.subject,
    });

    const data = toPublicTicket(ticket);
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

publicApiRouter.get(
  "/tickets",
  requireApiKey("tickets:read"),
  validate({ query: publicListTicketsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.apiKey as NonNullable<Request["apiKey"]>;
    const { items, meta } = await publicApiService.listTickets(orgId, req.query as never);
    res.json({ success: true, data: items, meta } satisfies ApiResponse<typeof items>);
  })
);

publicApiRouter.get(
  "/tickets/:id",
  requireApiKey("tickets:read"),
  validate({ params: publicTicketIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.apiKey as NonNullable<Request["apiKey"]>;
    const data = await publicApiService.getTicket(orgId, req.params.id as string);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

publicApiRouter.post(
  "/tickets/:id/messages",
  requireApiKey("tickets:write"),
  validate({ params: publicTicketIdParamSchema, body: publicAddMessageSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = req.apiKey as NonNullable<Request["apiKey"]>;
    const ticketId = req.params.id as string;

    const message = await publicApiService.addCustomerMessage(orgId, ticketId, req.body.message);

    emitToOrg(orgId, "ticket:message", message);
    emitToTicket(ticketId, "ticket:message", message);
    emitToTicketWidgetRoom(ticketId, "ticket:message", message);
    void publishEvent(KAFKA_TOPICS.MESSAGE_SENT, {
      eventId: uuid(),
      orgId,
      occurredAt: new Date().toISOString(),
      ticketId,
      messageId: message.id,
      authorType: "customer",
      body: message.body,
    });

    const data = { id: message.id, authorType: message.authorType, body: message.body, createdAt: message.createdAt };
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);
