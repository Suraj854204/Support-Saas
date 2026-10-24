import { Router } from "express";

import { cannedResponsesController } from "./canned-responses.controller";
import { createCannedResponseSchema, updateCannedResponseSchema } from "./canned-responses.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requireRole } from "@/middleware/rbac.middleware";
import { validate } from "@/middleware/validate.middleware";

export const cannedResponsesRouter = Router();

cannedResponsesRouter.use(requireAuth);

cannedResponsesRouter.get("/", asyncHandler(cannedResponsesController.list));
cannedResponsesRouter.post(
  "/",
  requireRole("agent"),
  validate({ body: createCannedResponseSchema }),
  asyncHandler(cannedResponsesController.create)
);
cannedResponsesRouter.patch(
  "/:id",
  requireRole("agent"),
  validate({ body: updateCannedResponseSchema }),
  asyncHandler(cannedResponsesController.update)
);
cannedResponsesRouter.delete("/:id", requireRole("agent"), asyncHandler(cannedResponsesController.remove));
