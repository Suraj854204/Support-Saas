import type { NextFunction, Request, Response } from "express";

import { AppError } from "@/lib/app-error";
import { verifyWidgetToken } from "@/lib/jwt";

/**
 * Widget tokens are issued to anonymous website visitors and live in far
 * more exposed contexts (third-party browser localStorage) than staff
 * access tokens, so they're signed with a separate secret and can only
 * ever resolve to a single customer scoped to one org — never a staff role.
 */
export function requireWidgetAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(AppError.unauthorized("Missing widget session token"));
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyWidgetToken(token);
    req.widgetAuth = { customerId: payload.sub, orgId: payload.orgId };
    return next();
  } catch {
    return next(AppError.unauthorized("Invalid or expired widget session"));
  }
}
