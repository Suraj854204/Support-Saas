import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import type { CreateAutomationRuleInput, UpdateAutomationRuleInput } from "./automations.schema";
import { automationsService } from "./automations.service";

import { AppError } from "@/lib/app-error";

export const automationsController = {
  async list(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const rules = await automationsService.list(req.auth.orgId);
    res.json({ success: true, data: rules } satisfies ApiResponse<typeof rules>);
  },

  async create(req: Request<unknown, unknown, CreateAutomationRuleInput>, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const rule = await automationsService.create(req.auth.orgId, req.auth.userId, req.body);
    res.status(201).json({ success: true, data: rule } satisfies ApiResponse<typeof rule>);
  },

  async update(req: Request<unknown, unknown, UpdateAutomationRuleInput>, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const rule = await automationsService.update(req.auth.orgId, req.params.id as string, req.body);
    res.json({ success: true, data: rule } satisfies ApiResponse<typeof rule>);
  },

  async remove(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    await automationsService.remove(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data: { deleted: true } } satisfies ApiResponse<{ deleted: true }>);
  },

  async runLogs(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const logs = await automationsService.getRunLogs(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data: logs } satisfies ApiResponse<typeof logs>);
  },
};
