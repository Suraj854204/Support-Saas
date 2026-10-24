import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import { knowledgeService } from "./knowledge.service";

import { AppError } from "@/lib/app-error";


export const knowledgeController = {
  async list(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const articles = await knowledgeService.list(req.auth.orgId);
    res.json({ success: true, data: articles } satisfies ApiResponse<typeof articles>);
  },

  async getById(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const article = await knowledgeService.getById(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data: article } satisfies ApiResponse<typeof article>);
  },

  async create(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const article = await knowledgeService.create(req.auth.orgId, req.body);
    res.status(201).json({ success: true, data: article } satisfies ApiResponse<typeof article>);
  },

  async update(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const article = await knowledgeService.update(req.auth.orgId, req.params.id as string, req.body);
    res.json({ success: true, data: article } satisfies ApiResponse<typeof article>);
  },

  async remove(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    await knowledgeService.delete(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data: { deleted: true } } satisfies ApiResponse<{ deleted: true }>);
  },
};
