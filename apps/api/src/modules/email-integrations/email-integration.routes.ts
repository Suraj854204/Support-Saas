import { Router } from "express";

import { emailIntegrationController } from "./email-integration.controller";
import { gmailCallbackQuerySchema, patchEmailSettingsSchema } from "./email-integration.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth, requireVerifiedEmail } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { authLimiter } from "@/middleware/rate-limit.middleware";
import { validate } from "@/middleware/validate.middleware";

export const emailIntegrationRouter = Router();

// Unauthenticated on purpose: Google redirects the user's bare browser here
// with ?code&state, no Authorization header available. Identity is
// recovered entirely from the signed, single-use state — see
// email-integration.service.ts#handleCallback.
emailIntegrationRouter.get(
  "/gmail/callback",
  validate({ query: gmailCallbackQuerySchema }),
  asyncHandler(emailIntegrationController.callback)
);

emailIntegrationRouter.use(requireAuth, requirePermission("manage_integrations"));

emailIntegrationRouter.get("/email", asyncHandler(emailIntegrationController.list));

emailIntegrationRouter.post(
  "/gmail/connect",
  authLimiter,
  requireVerifiedEmail,
  asyncHandler(emailIntegrationController.connect)
);

emailIntegrationRouter.post(
  "/gmail/sync",
  authLimiter,
  requireVerifiedEmail,
  asyncHandler(emailIntegrationController.sync)
);

emailIntegrationRouter.delete(
  "/email",
  requireVerifiedEmail,
  asyncHandler(emailIntegrationController.disconnect)
);

emailIntegrationRouter.patch(
  "/email/settings",
  requireVerifiedEmail,
  validate({ body: patchEmailSettingsSchema }),
  asyncHandler(emailIntegrationController.updateSettings)
);
