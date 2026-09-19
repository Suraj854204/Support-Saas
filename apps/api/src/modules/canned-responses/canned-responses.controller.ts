import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import type { CreateCannedResponseInput, UpdateCannedResponseInput } from "./canned-responses.schema";
import { cannedResponsesService } from "./canned-responses.service";

import { AppError } from "@/lib/app-error";

export const cannedResponsesController = {
  async list(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const items = await cannedResponsesService.list(req.auth.orgId);
    res.json({ success: true, data: items } satisfies ApiResponse<typeof items>);
  },

  async create(req: Request<unknown, unknown, CreateCannedResponseInput>, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const item = await cannedResponsesService.create(req.auth.orgId, req.auth.userId, req.body);
    res.status(201).json({ success: true, data: item } satisfies ApiResponse<typeof item>);
  },

  async update(req: Request<unknown, unknown, UpdateCannedResponseInput>, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const item = await cannedResponsesService.update(req.auth.orgId, req.params.id as string, req.body);
    res.json({ success: true, data: item } satisfies ApiResponse<typeof item>);
  },

  async remove(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    await cannedResponsesService.remove(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data: { deleted: true } } satisfies ApiResponse<{ deleted: true }>);
  },
};
