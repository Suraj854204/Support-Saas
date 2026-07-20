import { Router } from "express";

import { authController } from "./auth.controller";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from "./auth.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { authLimiter } from "@/middleware/rate-limit.middleware";
import { validate } from "@/middleware/validate.middleware";

export const authRouter = Router();

/**
 * POST /api/auth/register
 *
 * Creates a new organization and owner account.
 */
authRouter.post(
  "/register",
  authLimiter,
  validate({
    body: registerSchema,
  }),
  asyncHandler(
    authController.register,
  ),
);

/**
 * POST /api/auth/login
 *
 * Authenticates an existing user.
 */
authRouter.post(
  "/login",
  authLimiter,
  validate({
    body: loginSchema,
  }),
  asyncHandler(
    authController.login,
  ),
);

/**
 * POST /api/auth/forgot-password
 *
 * Sends a password-reset email when an active
 * account exists.
 *
 * Response remains generic so registered email
 * addresses cannot be discovered.
 */
authRouter.post(
  "/forgot-password",
  authLimiter,
  validate({
    body: forgotPasswordSchema,
  }),
  asyncHandler(
    authController.forgotPassword,
  ),
);

/**
 * POST /api/auth/reset-password
 *
 * Validates the password-reset token, updates
 * the password and invalidates all reset links
 * belonging to the user.
 */
authRouter.post(
  "/reset-password",
  authLimiter,
  validate({
    body: resetPasswordSchema,
  }),
  asyncHandler(
    authController.resetPassword,
  ),
);

/**
 * POST /api/auth/refresh
 *
 * Generates a new access and refresh token pair.
 */
authRouter.post(
  "/refresh",
  authLimiter,
  validate({
    body: refreshSchema,
  }),
  asyncHandler(
    authController.refresh,
  ),
);

/**
 * POST /api/auth/logout
 *
 * Revokes the refresh token and clears the
 * refresh cookie.
 */
authRouter.post(
  "/logout",
  asyncHandler(
    authController.logout,
  ),
);

/**
 * GET /api/auth/me
 *
 * Returns the currently authenticated user.
 */
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(
    authController.me,
  ),
);