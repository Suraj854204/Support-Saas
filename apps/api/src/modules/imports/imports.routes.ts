import type { ApiResponse } from "@support-saas/shared-types";
import express, { Router } from "express";
import { z } from "zod";

import { importsService } from "./imports.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { requireAuth, requireVerifiedEmail } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";

export const importsRouter = Router();

importsRouter.use(requireAuth, requirePermission("manage_integrations"));

const importQuerySchema = z.object({
  dryRun: z
    .enum(["true", "false"])
    .default("true") // safe default: preview unless the caller explicitly opts in
    .transform((v) => v === "true"),
});

/**
 * POST /api/imports/tickets?dryRun=true|false  (body: raw CSV, Content-Type: text/csv)
 * The body parser is scoped to this route so the app-wide JSON limit is untouched.
 */
importsRouter.post(
  "/tickets",
  requireVerifiedEmail,
  express.text({ type: ["text/csv", "text/plain"], limit: "10mb" }),
  validate({ query: importQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthorized();
    if (typeof req.body !== "string") {
      throw AppError.validation("Send the CSV as the request body with Content-Type: text/csv");
    }
    const { dryRun } = req.query as unknown as { dryRun: boolean };
    const data = await importsService.importTickets(req.auth.orgId, req.auth.userId, req.body, dryRun);
    res.status(dryRun ? 200 : 201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);
