import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { ALL_STATUSES, callRequestsService } from "./call-requests.service";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requireRole } from "@/middleware/rbac.middleware";
import { validate } from "@/middleware/validate.middleware";

export const callRequestsRouter = Router();
callRequestsRouter.use(requireAuth);

callRequestsRouter.get(
  "/",
  validate({ query: z.object({ status: z.enum(["open", "all", ...ALL_STATUSES]).default("open") }) }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await callRequestsService.list(req.auth!.orgId, (req.query.status as never) ?? "open") });
  })
);

callRequestsRouter.patch(
  "/:id",
  requireRole("agent"),
  validate({
    body: z.object({
      status: z.enum(ALL_STATUSES).optional(),
      scheduledAt: z.coerce.date().nullable().optional(),
      assigneeId: z.string().uuid().nullable().optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await callRequestsService.update(req.auth!.orgId, req.params.id as string, req.auth!.userId, req.body) });
  })
);
