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

// OTP verify/resend: tighter than authLimiter since these guard a
// short-lived 6-digit secret directly — the per-challenge attempt counter
// in the DB is the primary defense, this is the per-IP backstop.
export const otpLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
});

// Verification-email requests — generous enough for legitimate resends but
// tight enough to blunt mail-bombing a target address.
export const verificationLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
});
