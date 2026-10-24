import type { NextFunction, Request, Response } from "express";

import { AppError } from "@/lib/app-error";
import type { ApiKeyScope } from "@/modules/api-keys/api-keys.schema";
import { apiKeysService } from "@/modules/api-keys/api-keys.service";

/** Accepts `X-API-Key: ssk_...` or `Authorization: Bearer ssk_...`. */
export function extractApiKey(req: Pick<Request, "headers">): string | null {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.length > 0) return headerKey;

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);

  return null;
}

/**
 * Authenticates a public-API request by API key and enforces a scope.
 * Everything downstream scopes by req.apiKey.orgId — the same multi-tenancy
 * boundary as req.auth.orgId for dashboard users.
 */
export function requireApiKey(scope: ApiKeyScope) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const raw = extractApiKey(req);
      if (!raw) return next(AppError.unauthorized("Missing API key. Send it as 'X-API-Key' or a Bearer token."));

      const key = await apiKeysService.authenticate(raw);
      if (!key) return next(AppError.unauthorized("Invalid, revoked or expired API key"));

      if (!key.scopes.includes(scope)) {
        return next(AppError.forbidden(`This API key does not have the '${scope}' scope`));
      }

      req.apiKey = key;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
