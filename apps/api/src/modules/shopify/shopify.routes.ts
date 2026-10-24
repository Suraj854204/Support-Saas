import type { ApiResponse } from "@support-saas/shared-types";
import { Router } from "express";
import { z } from "zod";

import { shopifyService } from "./shopify.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { requireAuth, requireVerifiedEmail } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";

export const shopifyRouter = Router();

shopifyRouter.use(requireAuth);

const connectSchema = z.object({
  shopDomain: z.string().trim().min(3).max(200),
  accessToken: z.string().trim().min(10).max(200),
});

const ordersQuerySchema = z.object({ email: z.string().trim().email().max(254) });

function auth(req: { auth?: { orgId: string; userId: string } }) {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}

function ok<T>(res: import("express").Response, data: T, status = 200) {
  res.status(status).json({ success: true, data } satisfies ApiResponse<T>);
}

// Any agent can see whether Shopify is connected (drives the order panel).
shopifyRouter.get(
  "/",
  requirePermission("reply_ticket"),
  asyncHandler(async (req, res) => ok(res, await shopifyService.getStatus(auth(req).orgId)))
);

shopifyRouter.put(
  "/",
  requirePermission("manage_integrations"),
  requireVerifiedEmail,
  validate({ body: connectSchema }),
  asyncHandler(async (req, res) => {
    const { orgId, userId } = auth(req);
    ok(res, await shopifyService.connect(orgId, userId, req.body.shopDomain, req.body.accessToken));
  })
);

shopifyRouter.delete(
  "/",
  requirePermission("manage_integrations"),
  asyncHandler(async (req, res) => {
    const { orgId, userId } = auth(req);
    await shopifyService.disconnect(orgId, userId);
    ok(res, { disconnected: true as const });
  })
);

shopifyRouter.get(
  "/orders",
  requirePermission("reply_ticket"),
  validate({ query: ordersQuerySchema }),
  asyncHandler(async (req, res) => {
    ok(res, await shopifyService.lookupOrders(auth(req).orgId, (req.query as { email: string }).email));
  })
);
