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

usersRouter.post(
  "/",
  requireRole("admin"),
  validate({
    body: z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
      role: z.enum(["owner", "admin", "agent", "viewer"]),
      password: z.string().min(8, "Password must be at least 8 characters"),
    }),
  }),
  asyncHandler(usersController.invite)
);

usersRouter.get("/:id", asyncHandler(usersController.getById));

usersRouter.patch(
  "/:id/role",
  requireRole("admin"),
  validate({ body: z.object({ role: z.enum(["owner", "admin", "agent", "viewer"]) }) }),
  asyncHandler(usersController.updateRole)
);

usersRouter.delete("/:id", requireRole("admin"), asyncHandler(usersController.deactivate));
