import type { ApiResponse } from "@support-saas/shared-types";
import { Router } from "express";

import { demoDataService } from "./demo-data.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";

export const demoDataRouter = Router();
demoDataRouter.use(requireAuth, requirePermission("manage_integrations"));

demoDataRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await demoDataService.status(req.auth.orgId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

demoDataRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await demoDataService.seed(req.auth.orgId, req.auth.userId);
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

demoDataRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await demoDataService.clear(req.auth.orgId, req.auth.userId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);
