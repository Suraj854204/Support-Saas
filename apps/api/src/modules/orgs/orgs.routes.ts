import { Router } from "express";
import { z } from "zod";

import { orgsController } from "./orgs.controller";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requireRole } from "@/middleware/rbac.middleware";
import { validate } from "@/middleware/validate.middleware";


export const orgsRouter = Router();

orgsRouter.use(requireAuth);

orgsRouter.get("/current", asyncHandler(orgsController.getCurrent));

orgsRouter.patch(
  "/current",
  requireRole("admin"),
  validate({
    body: z.object({
      name: z.string().min(2).max(100).optional(),
      logoUrl: z.string().url().nullable().optional(),
      domain: z.string().nullable().optional(),
    }),
  }),
  asyncHandler(orgsController.updateCurrent)
);
