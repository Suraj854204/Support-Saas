import type { UserRole } from "@support-saas/shared-types";
import type { NextFunction, Request, Response } from "express";

import { AppError } from "@/lib/app-error";

// Ordered from least to most privileged. A user's role must be >= the
// minimum required role's index to pass.
const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  agent: 1,
  admin: 2,
  owner: 3,
};

/**
 * Gate a route to a minimum role. Must run after requireAuth.
 * Usage: router.delete('/:id', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(minRole: UserRole) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(AppError.unauthorized());
    }

    if (ROLE_RANK[req.auth.role] < ROLE_RANK[minRole]) {
      return next(
        AppError.forbidden(`This action requires the '${minRole}' role or higher`)
      );
    }

    return next();
  };
}

/**
 * Explicit allow-list variant for cases that aren't a clean hierarchy
 * (e.g. a route only owners and viewers — auditors — should see).
 */
export function requireAnyRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(AppError.unauthorized());
    }
    if (!roles.includes(req.auth.role)) {
      return next(AppError.forbidden(`This action requires one of: ${roles.join(", ")}`));
    }
    return next();
  };
}
