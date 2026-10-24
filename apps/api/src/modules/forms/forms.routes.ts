import crypto from "node:crypto";

import type { ApiResponse } from "@support-saas/shared-types";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { v4 as uuid } from "uuid";

import { createFormSchema, submissionsQuerySchema, submitFormSchema, updateFormSchema } from "./forms.schema";
import { formsService } from "./forms.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { requireAuth } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";
import { emitToOrg } from "@/sockets";

/* ------------------------- public: used by customers' websites ------------------------- */

const submitLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `f:${crypto.createHash("sha256").update(`${req.params.publicKey ?? ""}|${req.ip ?? "unknown"}`).digest("hex").slice(0, 32)}`,
  handler: (_req, _res, next) => next(AppError.rateLimited("Too many submissions. Please try again in a minute.")),
});

export const publicFormsRouter = Router();

publicFormsRouter.post(
  "/:publicKey/submit",
  submitLimiter,
  validate({ body: submitFormSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    const result = await formsService.submit(req.params.publicKey as string, origin, req.body);

    // Bots that filled the hidden field get the same answer as everyone else.
    if (!result) return void res.status(201).json({ success: true, data: { received: true } });

    const { ticket, form, escalated, contactWithinHours } = result;
    emitToOrg(form.orgId, "ticket:created", ticket);
    void publishEvent(KAFKA_TOPICS.TICKET_CREATED, {
      eventId: uuid(),
      orgId: form.orgId,
      occurredAt: new Date().toISOString(),
      ticketId: ticket.id,
      customerId: ticket.customerId,
      channel: ticket.channel,
      subject: ticket.subject,
    });

    // Visitors with a serious matter are told when to expect a person; nothing else about the ticket is exposed.
    const data = { received: true, reference: ticket.number, ...(escalated && { contactWithinHours }) };
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

/* ------------------------- authenticated: the helpdesk UI ------------------------- */

export const formsRouter = Router();
formsRouter.use(requireAuth);

formsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await formsService.list(req.auth.orgId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

formsRouter.get(
  "/submissions",
  validate({ query: submissionsQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const { items, meta } = await formsService.submissions(req.auth.orgId, req.query as never);
    res.json({ success: true, data: items, meta } satisfies ApiResponse<typeof items>);
  })
);

formsRouter.post(
  "/",
  requirePermission("manage_integrations"),
  validate({ body: createFormSchema }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await formsService.create(req.auth.orgId, req.auth.userId, req.body);
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

formsRouter.patch(
  "/:id",
  requirePermission("manage_integrations"),
  validate({ body: updateFormSchema }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await formsService.update(req.auth.orgId, req.params.id as string, req.auth.userId, req.body);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

formsRouter.delete(
  "/:id",
  requirePermission("manage_integrations"),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    await formsService.remove(req.auth.orgId, req.params.id as string, req.auth.userId);
    res.json({ success: true, data: { deleted: true } } satisfies ApiResponse<{ deleted: true }>);
  })
);
