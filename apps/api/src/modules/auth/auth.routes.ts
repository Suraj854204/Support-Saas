import { Router } from "express";

import { authController } from "./auth.controller";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendLoginOtpSchema,
  resetPasswordSchema,
  sendVerificationSchema,
  sessionIdParamSchema,
  verifyEmailSchema,
  verifyLoginOtpSchema,
} from "./auth.schema";

import { asyncHandler } from "@/lib/async-handler";
import { optionalAuth, requireAuth } from "@/middleware/auth.middleware";
import {
  authLimiter,
  otpLimiter,
  verificationLimiter,
} from "@/middleware/rate-limit.middleware";
import { validate } from "@/middleware/validate.middleware";
import { acceptInvitationSchema } from "@/modules/invitations/invitations.schema";

export const authRouter = Router();

authRouter.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(authController.register)
);

authRouter.post(
  "/login",
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login)
);

authRouter.post(
  "/verify-login-otp",
  otpLimiter,
  validate({ body: verifyLoginOtpSchema }),
  asyncHandler(authController.verifyLoginOtp)
);

authRouter.post(
  "/resend-login-otp",
  otpLimiter,
  validate({ body: resendLoginOtpSchema }),
  asyncHandler(authController.resendLoginOtp)
);

authRouter.post(
  "/refresh",
  authLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(authController.refresh)
);

authRouter.post(
  "/logout",
  asyncHandler(authController.logout)
);

authRouter.post(
  "/logout-all",
  requireAuth,
  asyncHandler(authController.logoutAll)
);

authRouter.get(
  "/sessions",
  requireAuth,
  asyncHandler(authController.listSessions)
);

authRouter.delete(
  "/sessions/:sessionId",
  requireAuth,
  validate({ params: sessionIdParamSchema }),
  asyncHandler(authController.revokeSession)
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(authController.me)
);

authRouter.post(
  "/send-verification",
  verificationLimiter,
  optionalAuth,
  validate({ body: sendVerificationSchema }),
  asyncHandler(authController.sendVerification)
);

authRouter.post(
  "/verify-email",
  authLimiter,
  validate({ body: verifyEmailSchema }),
  asyncHandler(authController.verifyEmail)
);

/**
 * Forgot password
 *
 * POST /api/auth/forgot-password
 *
 * Body:
 * {
 *   "email": "user@example.com"
 * }
 */
authRouter.post(
  "/forgot-password",
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(authController.forgotPassword)
);

/**
 * Reset password
 *
 * POST /api/auth/reset-password
 *
 * Body:
 * {
 *   "token": "reset-token",
 *   "password": "new-password"
 * }
 */
authRouter.post(
  "/reset-password",
  authLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(authController.resetPassword)
);

authRouter.post(
  "/accept-invitation",
  authLimiter,
  validate({ body: acceptInvitationSchema }),
  asyncHandler(authController.acceptInvitation)
);