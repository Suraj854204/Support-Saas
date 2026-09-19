
import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import { toPublicUser } from "./user.serializer";
import { usersService } from "./users.service";

import { AppError } from "@/lib/app-error";

export const usersController = {
  async list(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const users = await usersService.listForOrg(req.auth.orgId);
    const body: ApiResponse<ReturnType<typeof toPublicUser>[]> = {
      success: true,
      data: users.map(toPublicUser),
    };
    res.json(body);
  },

  async getById(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const user = await usersService.getById(req.auth.orgId, req.params.id as string);
    const body: ApiResponse<ReturnType<typeof toPublicUser>> = {
      success: true,
      data: toPublicUser(user),
    };
    res.json(body);
  },

  async updateRole(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const user = await usersService.updateRole(
      req.auth.orgId,
      req.params.id as string,
      req.body.role
    );
    const body: ApiResponse<ReturnType<typeof toPublicUser>> = {
      success: true,
      data: toPublicUser(user),
    };
    res.json(body);
  },

  async deactivate(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const user = await usersService.setActive(req.auth.orgId, req.params.id as string, false);
    const body: ApiResponse<ReturnType<typeof toPublicUser>> = {
      success: true,
      data: toPublicUser(user),
    };
    res.json(body);
  },

  async reactivate(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const user = await usersService.setActive(req.auth.orgId, req.params.id as string, true);
    const body: ApiResponse<ReturnType<typeof toPublicUser>> = {
      success: true,
      data: toPublicUser(user),
    };
    res.json(body);
  },

  async updateCapacity(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const user = await usersService.updateCapacity(req.auth.orgId, req.params.id as string, req.body);
    const body: ApiResponse<ReturnType<typeof toPublicUser>> = {
      success: true,
      data: toPublicUser(user),
    };
    res.json(body);
  },

  async workloads(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const workloads = await usersService.getWorkloads(req.auth.orgId);
    const body: ApiResponse<typeof workloads> = { success: true, data: workloads };
    res.json(body);
  },
};
