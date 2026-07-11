import rateLimit, { type Options } from "express-rate-limit";

import { AppError } from "@/lib/app-error";

/**
 * In-memory-store limiter is fine for a single instance; swap the `store`
 * option for `rate-limit-redis` once the API runs as multiple replicas
 * behind the load balancer (Phase 7 / Kubernetes).
 */
function makeLimiter(options: Partial<Options>) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(AppError.rateLimited()),
    ...options,
  });
}

// Generous default for normal API traffic
export const defaultLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 300,
});

// Tight limiter for auth endpoints to blunt credential-stuffing/brute force
export const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
});

// Public, unauthenticated widget endpoint — limited per-IP to blunt spam
// conversation creation from a single visitor/bot.
export const widgetLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 30,
});
