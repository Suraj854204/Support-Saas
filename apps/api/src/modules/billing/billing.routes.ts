import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { billingService } from "./billing.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";

export const billingRouter = Router();

billingRouter.use(requireAuth, requirePermission("manage_billing"));

billingRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await billingService.overview(req.auth!.orgId) });
  })
);

billingRouter.post(
  "/checkout",
  validate({ body: z.object({ plan: z.enum(["starter", "growth", "enterprise"]) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    // Identity comes from the verified token, never from the request body.
    const user = await prisma.user.findFirst({ where: { id: auth.userId, orgId: auth.orgId }, select: { id: true, email: true } });
    if (!user) throw AppError.unauthorized();
    res.json({ success: true, data: await billingService.createCheckout(auth.orgId, user, req.body.plan) });
  })
);

billingRouter.get(
  "/invoices",
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await billingService.invoices(req.auth!.orgId) });
  })
);

billingRouter.patch(
  "/overage",
  validate({ body: z.object({ enabled: z.boolean() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await billingService.setOverage(req.auth!.orgId, req.body.enabled) });
  })
);

billingRouter.post(
  "/portal",
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await billingService.createPortal(req.auth!.orgId) });
  })
);

/**
 * Stripe calls this with no login, so it is authenticated ONLY by the signature over the raw body.
 * It is mounted in app.ts BEFORE express.json(), because parsing would change the bytes that were signed.
 */
export const stripeWebhookHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await billingService.handleWebhook(req.body as Buffer, req.headers["stripe-signature"] as string | undefined);
  res.status(200).json({ received: true, ...result });
});
