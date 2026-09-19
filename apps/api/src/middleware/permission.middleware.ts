import type { Permission } from "@support-saas/shared-types";
import type { NextFunction, Request, Response } from "express";

import { AppError } from "@/lib/app-error";
import { hasPermission } from "@/lib/permissions";

/**
 * Gate a route by permission instead of role name. Must run after
 * requireAuth. Usage: router.post('/', requireAuth, requirePermission('manage_team'), handler)
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(AppError.unauthorized());
    }
    if (!hasPermission(req.auth.role, permission)) {
      return next(AppError.forbidden(`This action requires the '${permission}' permission`));
    }
    return next();
  };
}
