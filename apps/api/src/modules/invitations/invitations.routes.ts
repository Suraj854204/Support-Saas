import { Router } from "express";

import { invitationsController } from "./invitations.controller";
import { createInvitationSchema, invitationIdParamSchema } from "./invitations.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";

export const invitationsRouter = Router();

invitationsRouter.use(requireAuth, requirePermission("manage_team"));

invitationsRouter.post(
  "/",
  validate({ body: createInvitationSchema }),
  asyncHandler(invitationsController.create)
);

invitationsRouter.get("/", asyncHandler(invitationsController.list));

invitationsRouter.delete(
  "/:id",
  validate({ params: invitationIdParamSchema }),
  asyncHandler(invitationsController.revoke)
);
