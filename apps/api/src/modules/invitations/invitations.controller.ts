import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import type { CreateInvitationInput, InvitationIdParam } from "./invitations.schema";
import { toPublicInvitation } from "./invitation.serializer";
import { invitationsService } from "./invitations.service";

import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

export const invitationsController = {
  async create(req: Request<unknown, unknown, CreateInvitationInput>, res: Response) {
    if (!req.auth) throw AppError.unauthorized();

    const inviter = await prisma.user.findUnique({ where: { id: req.auth.userId } });
    if (!inviter) throw AppError.unauthorized();

    const invitation = await invitationsService.create(
      req.auth.orgId,
      { id: inviter.id, name: inviter.name, role: inviter.role },
      req.body
    );

    const body: ApiResponse<ReturnType<typeof toPublicInvitation>> = {
      success: true,
      data: toPublicInvitation(invitation),
    };
    res.status(201).json(body);
  },

  async list(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const invitations = await invitationsService.list(req.auth.orgId);
    const body: ApiResponse<ReturnType<typeof toPublicInvitation>[]> = {
      success: true,
      data: invitations.map(toPublicInvitation),
    };
    res.json(body);
  },

  async revoke(req: Request<InvitationIdParam>, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    await invitationsService.revoke(req.auth.orgId, req.params.id, req.auth.userId);
    const body: ApiResponse<{ revoked: true }> = { success: true, data: { revoked: true } };
    res.json(body);
  },
};
