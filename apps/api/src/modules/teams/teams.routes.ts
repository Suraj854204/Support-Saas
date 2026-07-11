import { Router } from "express";
import { z } from "zod";

import { teamsController } from "./teams.controller";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requireRole } from "@/middleware/rbac.middleware";
import { validate } from "@/middleware/validate.middleware";


export const teamsRouter = Router();

teamsRouter.use(requireAuth);

teamsRouter.get("/", asyncHandler(teamsController.list));

teamsRouter.post(
  "/",
  requireRole("admin"),
  validate({ body: z.object({ name: z.string().min(2).max(100) }) }),
  asyncHandler(teamsController.create)
);

teamsRouter.get("/:id", asyncHandler(teamsController.getById));

teamsRouter.post(
  "/:id/members",
  requireRole("admin"),
  validate({ body: z.object({ userId: z.string().uuid() }) }),
  asyncHandler(teamsController.addMember)
);

teamsRouter.delete("/:id/members/:userId", requireRole("admin"), asyncHandler(teamsController.removeMember));

teamsRouter.delete("/:id", requireRole("admin"), asyncHandler(teamsController.remove));
