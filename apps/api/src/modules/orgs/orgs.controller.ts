import type { ApiResponse, Organization } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import { orgsService } from "./orgs.service";

import { AppError } from "@/lib/app-error";


export const orgsController = {
  async getCurrent(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const org = await orgsService.getById(req.auth.orgId);
    const body: ApiResponse<Organization> = { success: true, data: org as unknown as Organization };
    res.json(body);
  },

  async updateCurrent(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const org = await orgsService.update(req.auth.orgId, req.body);
    const body: ApiResponse<Organization> = { success: true, data: org as unknown as Organization };
    res.json(body);
  },
};
