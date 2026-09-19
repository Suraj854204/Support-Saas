import type { ApiResponse } from "@support-saas/shared-types";
import { Router, type Request, type Response } from "express";

import { semanticCacheService, type CacheStats } from "./semantic-cache.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";

export const semanticCacheRouter = Router();

// Cache internals expose aggregate counters only — never cached replies —
// but they still describe org activity, so they stay behind the same
// permission as the other security/admin surfaces.
semanticCacheRouter.use(requireAuth, requirePermission("manage_security"));

semanticCacheRouter.get(
  "/stats",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthorized();
    const stats = await semanticCacheService.getStats();
    res.json({ success: true, data: stats } satisfies ApiResponse<CacheStats>);
  })
);

// Always scoped to the caller's own org — an admin can never flush another
// tenant's cache from here.
semanticCacheRouter.post(
  "/invalidate",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthorized();
    const result = await semanticCacheService.invalidateOrg(req.auth.orgId);
    res.json({ success: true, data: result } satisfies ApiResponse<typeof result>);
  })
);
