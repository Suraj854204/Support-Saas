import { Router } from "express";
import { z } from "zod";

import { orgsController } from "./orgs.controller";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requireRole } from "@/middleware/rbac.middleware";
import { validate } from "@/middleware/validate.middleware";

const priorityMinutesSchema = z.object({
  urgent: z.number().int().min(1),
  high: z.number().int().min(1),
  normal: z.number().int().min(1),
  low: z.number().int().min(1),
});

const businessHoursSchema = z.object({
  timezone: z.string().min(1),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
});

const slaPolicySchema = z.object({
  firstResponseMinutes: priorityMinutesSchema,
  resolutionMinutes: priorityMinutesSchema,
  escalationEnabled: z.boolean(),
  escalateAfterMinutes: z.number().int().min(1),
  escalateToUserId: z.string().uuid().nullable(),
});

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
      defaultTicketPriority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      businessHours: businessHoursSchema.nullable().optional(),
      slaPolicy: slaPolicySchema.nullable().optional(),
    }),
  }),
  asyncHandler(orgsController.updateCurrent)
);
