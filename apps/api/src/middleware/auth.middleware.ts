import type { NextFunction, Request, Response } from "express";

import { AppError } from "@/lib/app-error";
import { verifyAccessToken } from "@/lib/jwt";

/**
 * Requires a valid Bearer access token. Attaches { userId, orgId, role } to
 * req.auth for downstream handlers and the RBAC middleware.
 *
 * Every org-scoped query in the app must filter by req.auth.orgId — this is
 * the multi-tenancy boundary. There is no cross-org data access path.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return next(AppError.unauthorized("Missing or malformed Authorization header"));
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, orgId: payload.orgId, role: payload.role };
    return next();
  } catch {
    return next(AppError.unauthorized("Invalid or expired access token"));
  }
}
