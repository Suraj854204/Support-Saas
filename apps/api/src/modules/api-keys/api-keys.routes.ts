import type { ApiResponse } from "@support-saas/shared-types";
import { Router, type Request, type Response } from "express";

import { apiKeyIdParamSchema, createApiKeySchema } from "./api-keys.schema";
import { apiKeysService } from "./api-keys.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { requireAuth, requireVerifiedEmail } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";

export const apiKeysRouter = Router();

apiKeysRouter.use(requireAuth, requirePermission("manage_integrations"));

apiKeysRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await apiKeysService.list(req.auth.orgId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

// The raw key is in this response and nowhere else, ever — it cannot be fetched again.
apiKeysRouter.post(
  "/",
  requireVerifiedEmail,
  validate({ body: createApiKeySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthorized();
    const data = await apiKeysService.create(req.auth.orgId, req.auth.userId, req.body);
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

apiKeysRouter.delete(
  "/:id",
  validate({ params: apiKeyIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthorized();
    await apiKeysService.revoke(req.auth.orgId, req.auth.userId, req.params.id as string);
    const data = { revoked: true as const };
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);
