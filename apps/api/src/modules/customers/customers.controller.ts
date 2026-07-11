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
};
