import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import { customersService } from "./customers.service";

import { AppError } from "@/lib/app-error";

export const customersController = {
  async list(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const customers = await customersService.list(req.auth.orgId, req.query.search as string | undefined);
    res.json({ success: true, data: customers } satisfies ApiResponse<typeof customers>);
  },

  async create(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const customer = await customersService.create(req.auth.orgId, req.body);
    res.status(201).json({ success: true, data: customer } satisfies ApiResponse<typeof customer>);
  },

  async getById(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const customer = await customersService.getById(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data: customer } satisfies ApiResponse<typeof customer>);
  },

  async update(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const customer = await customersService.update(req.auth.orgId, req.params.id as string, req.body);
    res.json({ success: true, data: customer } satisfies ApiResponse<typeof customer>);
  },

  async merge(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const merged = await customersService.merge(req.auth.orgId, req.params.id as string, req.body, req.auth.userId);
    res.json({ success: true, data: merged } satisfies ApiResponse<typeof merged>);
  },

  async exportData(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const data = await customersService.exportData(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  },

  async requestDeletion(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const customer = await customersService.requestDeletion(req.auth.orgId, req.params.id as string, req.auth.userId);
    res.json({ success: true, data: customer } satisfies ApiResponse<typeof customer>);
  },
};
