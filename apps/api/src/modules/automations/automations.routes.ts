import { Router } from "express";

import { automationsController } from "./automations.controller";
import { createAutomationRuleSchema, updateAutomationRuleSchema } from "./automations.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";

export const automationsRouter = Router();

automationsRouter.use(requireAuth, requirePermission("manage_automation"));

automationsRouter.get("/", asyncHandler(automationsController.list));
automationsRouter.post(
  "/",
  validate({ body: createAutomationRuleSchema }),
  asyncHandler(automationsController.create)
);
automationsRouter.patch(
  "/:id",
  validate({ body: updateAutomationRuleSchema }),
  asyncHandler(automationsController.update)
);
automationsRouter.delete("/:id", asyncHandler(automationsController.remove));
automationsRouter.get("/:id/run-logs", asyncHandler(automationsController.runLogs));
