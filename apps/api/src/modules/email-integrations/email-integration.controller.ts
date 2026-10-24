import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import type { GmailCallbackQuery, PatchEmailSettingsInput } from "./email-integration.schema";
import { toPublicEmailConnection } from "./email-integration.serializer";
import { emailIntegrationService } from "./email-integration.service";
import { gmailSyncService } from "./gmail-sync.service";

import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

export const emailIntegrationController = {
  async list(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const connections = await emailIntegrationService.list(req.auth.orgId);
    const body: ApiResponse<ReturnType<typeof toPublicEmailConnection>[]> = {
      success: true,
      data: connections.map(toPublicEmailConnection),
    };
    res.json(body);
  },

  async connect(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const { authUrl } = await emailIntegrationService.initiateConnect(req.auth.orgId, req.auth.userId);
    const body: ApiResponse<{ authUrl: string }> = { success: true, data: { authUrl } };
    res.json(body);
  },

  /**
   * Google redirects the user's browser here directly — there's no
   * Authorization header on this request. Identity comes entirely from the
   * signed, single-use OAuth state minted in `connect`, not from a session.
   */
  async callback(req: Request<unknown, unknown, unknown, GmailCallbackQuery>, res: Response) {
    const { redirectUrl } = await emailIntegrationService.handleCallback(req.query);
    res.redirect(redirectUrl);
  },

  async sync(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();

    const connection = await prisma.emailConnection.findFirst({
      where: { orgId: req.auth.orgId, isActive: true },
    });
    if (!connection) throw AppError.notFound("No active email connection found for this organization");

    const result = await gmailSyncService.syncConnection(connection.id);
    const body: ApiResponse<{ processed: number; skipped: number; failed: number }> = {
      success: true,
      data: result,
    };
    res.json(body);
  },

  async disconnect(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const connection = await emailIntegrationService.disconnect(req.auth.orgId, req.auth.userId);
    const body: ApiResponse<ReturnType<typeof toPublicEmailConnection>> = {
      success: true,
      data: toPublicEmailConnection(connection),
    };
    res.json(body);
  },

  async updateSettings(req: Request<unknown, unknown, PatchEmailSettingsInput>, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const connection = await emailIntegrationService.updateSettings(req.auth.orgId, req.body);
    const body: ApiResponse<ReturnType<typeof toPublicEmailConnection>> = {
      success: true,
      data: toPublicEmailConnection(connection),
    };
    res.json(body);
  },
};
