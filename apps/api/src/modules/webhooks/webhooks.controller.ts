import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import { webhooksService } from "./webhooks.service";

import { AppError } from "@/lib/app-error";

function requireAuthContext(req: Request) {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}

export const webhooksController = {
  async list(req: Request, res: Response) {
    const auth = requireAuthContext(req);
    const data = await webhooksService.list(auth.orgId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  },

  async create(req: Request, res: Response) {
    const auth = requireAuthContext(req);
    const data = await webhooksService.create(auth.orgId, auth.userId, req.body);
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  },

  async update(req: Request, res: Response) {
    const auth = requireAuthContext(req);
    const data = await webhooksService.update(auth.orgId, auth.userId, req.params.id as string, req.body);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  },

  async remove(req: Request, res: Response) {
    const auth = requireAuthContext(req);
    await webhooksService.remove(auth.orgId, auth.userId, req.params.id as string);
    const data = { deleted: true as const };
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  },

  async rotateSecret(req: Request, res: Response) {
    const auth = requireAuthContext(req);
    const data = await webhooksService.rotateSecret(auth.orgId, auth.userId, req.params.id as string);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  },

  async sendTest(req: Request, res: Response) {
    const auth = requireAuthContext(req);
    const data = await webhooksService.sendTest(auth.orgId, req.params.id as string);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  },

  async listDeliveries(req: Request, res: Response) {
    const auth = requireAuthContext(req);
    const data = await webhooksService.listDeliveries(auth.orgId, req.params.id as string);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  },

  async retryDelivery(req: Request, res: Response) {
    const auth = requireAuthContext(req);
    const data = await webhooksService.retryDelivery(auth.orgId, req.params.deliveryId as string);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  },
};
