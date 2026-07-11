import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import { teamsService } from "./teams.service";

import { AppError } from "@/lib/app-error";


export const teamsController = {
  async list(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const teams = await teamsService.list(req.auth.orgId);
    res.json({ success: true, data: teams } satisfies ApiResponse<typeof teams>);
  },

  async create(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const team = await teamsService.create(req.auth.orgId, req.body.name);
    res.status(201).json({ success: true, data: team } satisfies ApiResponse<typeof team>);
  },

  async getById(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const team = await teamsService.getById(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data: team } satisfies ApiResponse<typeof team>);
  },

  async addMember(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const membership = await teamsService.addMember(
      req.auth.orgId,
      req.params.id as string,
      req.body.userId
    );
    res.status(201).json({ success: true, data: membership } satisfies ApiResponse<typeof membership>);
  },

  async removeMember(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    await teamsService.removeMember(req.auth.orgId, req.params.id as string, req.params.userId as string);
    res.json({ success: true, data: { removed: true } } satisfies ApiResponse<{ removed: true }>);
  },

  async remove(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    await teamsService.delete(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data: { deleted: true } } satisfies ApiResponse<{ deleted: true }>);
  },
};
