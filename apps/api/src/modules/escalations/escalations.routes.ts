import type { ApiResponse } from "@support-saas/shared-types";
import { Router } from "express";
import { z } from "zod";

import { escalationsService } from "./escalations.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";

export const escalationsRouter = Router();
escalationsRouter.use(requireAuth);

const listQuery = z.object({ state: z.enum(["open", "overdue", "done", "all"]).default("open") });
const contactBody = z.object({ method: z.enum(["call", "message"]), note: z.string().trim().max(1000).optional() });
const manualBody = z.object({
  ticketId: z.string().uuid(),
  level: z.enum(["high", "critical"]).default("high"),
  reason: z.string().trim().min(1).max(300).default("Escalated by a team member"),
});

escalationsRouter.get(
  "/",
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await escalationsService.list(req.auth.orgId, (req.query as unknown as z.infer<typeof listQuery>).state);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

escalationsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await escalationsService.summary(req.auth.orgId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

escalationsRouter.post(
  "/",
  requirePermission("reply_ticket"),
  validate({ body: manualBody }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const b = req.body as z.infer<typeof manualBody>;
    const data = await escalationsService.escalate(req.auth.orgId, b.ticketId, {
      level: b.level,
      reasons: [b.reason],
      preferredMethod: null,
      actorId: req.auth.userId,
    });
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

escalationsRouter.post(
  "/:id/contact",
  requirePermission("reply_ticket"),
  validate({ body: contactBody }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await escalationsService.logContact(req.auth.orgId, req.params.id as string, req.auth.userId, req.body);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);
