import type { NextFunction, Request, Response } from "express";

import { AppError } from "@/lib/app-error";
import { verifyAccessToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

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

/**
 * Attaches req.auth when a valid Bearer token is present, but never rejects
 * the request otherwise. For endpoints (like send-verification) that behave
 * correctly whether the caller is logged in or anonymous-with-an-email.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.auth = { userId: payload.sub, orgId: payload.orgId, role: payload.role };
  } catch {
    // Ignore — treat as anonymous rather than failing the request.
  }
  return next();
}

/**
 * Gates sensitive actions (Gmail connect, billing, invitations) behind a
 * verified email, per Feature 2. Must run after requireAuth. Does one extra
 * DB read rather than trusting the JWT's snapshot of emailVerified, since a
 * verification completed after the current access token was issued should
 * take effect immediately rather than waiting for a token refresh.
 */
export async function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    return next(AppError.unauthorized());
  }

  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!user || !user.emailVerifiedAt) {
    return next(AppError.forbidden("Please verify your email address before doing this."));
  }

  return next();
}
