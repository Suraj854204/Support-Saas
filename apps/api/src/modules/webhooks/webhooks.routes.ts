import { Router } from "express";

import { webhooksController } from "./webhooks.controller";
import {
  createWebhookSchema,
  deliveryIdParamSchema,
  updateWebhookSchema,
  webhookIdParamSchema,
} from "./webhooks.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth, requireVerifiedEmail } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";

export const webhooksRouter = Router();

webhooksRouter.use(requireAuth, requirePermission("manage_integrations"));

webhooksRouter.get("/", asyncHandler(webhooksController.list));

webhooksRouter.post(
  "/",
  requireVerifiedEmail,
  validate({ body: createWebhookSchema }),
  asyncHandler(webhooksController.create)
);

webhooksRouter.patch(
  "/:id",
  validate({ params: webhookIdParamSchema, body: updateWebhookSchema }),
  asyncHandler(webhooksController.update)
);

webhooksRouter.delete("/:id", validate({ params: webhookIdParamSchema }), asyncHandler(webhooksController.remove));

webhooksRouter.post(
  "/:id/rotate-secret",
  validate({ params: webhookIdParamSchema }),
  asyncHandler(webhooksController.rotateSecret)
);

webhooksRouter.post("/:id/test", validate({ params: webhookIdParamSchema }), asyncHandler(webhooksController.sendTest));

webhooksRouter.get(
  "/:id/deliveries",
  validate({ params: webhookIdParamSchema }),
  asyncHandler(webhooksController.listDeliveries)
);

webhooksRouter.post(
  "/deliveries/:deliveryId/retry",
  validate({ params: deliveryIdParamSchema }),
  asyncHandler(webhooksController.retryDelivery)
);
