import type { ApiResponse } from "@support-saas/shared-types";
import { Router, type Request, type Response } from "express";

import { analyticsService, type AnalyticsSummary, type TicketVolumePoint } from "./analytics.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get(
  "/tickets-volume",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthorized();
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    const points = await analyticsService.getTicketVolume(req.auth.orgId, days);
    res.json({ success: true, data: points } satisfies ApiResponse<TicketVolumePoint[]>);
  })
);

analyticsRouter.get(
  "/summary",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthorized();
    const summary = await analyticsService.getSummary(req.auth.orgId);
    res.json({ success: true, data: summary } satisfies ApiResponse<AnalyticsSummary>);
  })
);
