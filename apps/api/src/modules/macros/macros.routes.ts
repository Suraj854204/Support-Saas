import type { ApiResponse } from "@support-saas/shared-types";
import { Router } from "express";

import { applyMacroSchema, createMacroSchema, updateMacroSchema } from "./macros.schema";
import { macrosService } from "./macros.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";

export const macrosRouter = Router();
macrosRouter.use(requireAuth);

// Anyone who can reply can see and run macros; only automation managers edit them.
macrosRouter.get(
  "/",
  requirePermission("reply_ticket"),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await macrosService.list(req.auth.orgId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

macrosRouter.post(
  "/",
  requirePermission("manage_automation"),
  validate({ body: createMacroSchema }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await macrosService.create(req.auth.orgId, req.auth.userId, req.body);
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

macrosRouter.patch(
  "/:id",
  requirePermission("manage_automation"),
  validate({ body: updateMacroSchema }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await macrosService.update(req.auth.orgId, req.params.id as string, req.auth.userId, req.body);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

macrosRouter.delete(
  "/:id",
  requirePermission("manage_automation"),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    await macrosService.remove(req.auth.orgId, req.params.id as string, req.auth.userId);
    res.json({ success: true, data: { deleted: true } } satisfies ApiResponse<{ deleted: true }>);
  })
);

macrosRouter.post(
  "/:id/apply",
  requirePermission("reply_ticket"),
  validate({ body: applyMacroSchema }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const user = await prisma.user.findFirst({ where: { id: req.auth.userId, orgId: req.auth.orgId }, select: { name: true } });
    const data = await macrosService.apply(req.auth.orgId, req.params.id as string, req.body.ticketId, {
      userId: req.auth.userId,
      name: user?.name ?? "Support",
    });
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);
