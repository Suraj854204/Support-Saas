import { Router } from "express";
import { z } from "zod";

import { usersController } from "./users.controller";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requireRole } from "@/middleware/rbac.middleware";
import { validate } from "@/middleware/validate.middleware";


export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/", asyncHandler(usersController.list));

usersRouter.get("/:id", asyncHandler(usersController.getById));

usersRouter.patch(
  "/:id/role",
  requireRole("admin"),
  validate({ body: z.object({ role: z.enum(["owner", "admin", "agent", "viewer"]) }) }),
  asyncHandler(usersController.updateRole)
);

usersRouter.delete("/:id", requireRole("admin"), asyncHandler(usersController.deactivate));
usersRouter.post("/:id/reactivate", requireRole("admin"), asyncHandler(usersController.reactivate));

usersRouter.get("/workloads/all", requireRole("admin"), asyncHandler(usersController.workloads));

usersRouter.patch(
  "/:id/capacity",
  requireRole("admin"),
  validate({
    body: z.object({
      weeklyCapacity: z.number().int().min(0).max(500).nullable().optional(),
      timezone: z.string().max(100).nullable().optional(),
    }),
  }),
  asyncHandler(usersController.updateCapacity)
);
