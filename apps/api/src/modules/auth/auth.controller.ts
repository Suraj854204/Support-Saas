import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendLoginOtpInput,
  ResetPasswordInput,
  SendVerificationInput,
  SessionIdParam,
  VerifyEmailInput,
  VerifyLoginOtpInput,
} from "./auth.schema";
import { authService } from "./auth.service";

import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";
import type { AcceptInvitationInput } from "@/modules/invitations/invitations.schema";
import { invitationsService } from "@/modules/invitations/invitations.service";
import { toPublicUser } from "@/modules/users/user.serializer";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: "/api/auth",
  });
}

function setTrustedDeviceCookie(res: Response, token: string) {
  res.cookie(env.TRUSTED_DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: env.TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });
}

/** Best-effort client IP/user-agent capture for login-activity auditing — never authoritative for auth decisions. */
function getDeviceContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

export const authController = {
  async register(
    req: Request<unknown, unknown, RegisterInput>,
    res: Response,
  ) {
    const { user, org, tokens } = await authService.register(
      req.body,
      getDeviceContext(req),
    );

    setRefreshCookie(res, tokens.refreshToken);

    const body: ApiResponse<{
      user: ReturnType<typeof toPublicUser>;
      org: typeof org;
      accessToken: string;
    }> = {
      success: true,
      data: {
        user: toPublicUser(user),
        org,
        accessToken: tokens.accessToken,
      },
    };

    res.status(201).json(body);
  },

  async login(
    req: Request<unknown, unknown, LoginInput>,
    res: Response,
  ) {
    const trustedDeviceToken =
      req.cookies?.[env.TRUSTED_DEVICE_COOKIE_NAME];

    const result = await authService.login(req.body, {
      ...getDeviceContext(req),
      trustedDeviceToken,
    });

    if (!result.requiresOtp) {
      setRefreshCookie(res, result.tokens.refreshToken);

      const body: ApiResponse<{
        requiresOtp: false;
        user: ReturnType<typeof toPublicUser>;
        accessToken: string;
      }> = {
        success: true,
        data: {
          requiresOtp: false,
          user: toPublicUser(result.user),
          accessToken: result.tokens.accessToken,
        },
      };

      return res.status(200).json(body);
    }

    const body: ApiResponse<{
      requiresOtp: true;
      challengeId: string;
      maskedEmail: string;
      expiresInSeconds: number;
    }> = {
      success: true,
      data: {
        requiresOtp: true,
        challengeId: result.challengeId,
        maskedEmail: result.maskedEmail,
        expiresInSeconds: result.expiresInSeconds,
      },
    };

    res.status(200).json(body);
  },

  async verifyLoginOtp(
    req: Request<unknown, unknown, VerifyLoginOtpInput>,
    res: Response,
  ) {
    const {
      user,
      tokens,
      trustedDeviceToken,
    } = await authService.verifyLoginOtp(
      req.body,
      getDeviceContext(req),
    );

    setRefreshCookie(res, tokens.refreshToken);

    if (trustedDeviceToken) {
      setTrustedDeviceCookie(res, trustedDeviceToken);
    }

    const body: ApiResponse<{
      user: ReturnType<typeof toPublicUser>;
      accessToken: string;
    }> = {
      success: true,
      data: {
        user: toPublicUser(user),
        accessToken: tokens.accessToken,
      },
    };

    res.status(200).json(body);
  },

  async resendLoginOtp(
    req: Request<unknown, unknown, ResendLoginOtpInput>,
    res: Response,
  ) {
    const result = await authService.resendLoginOtp(req.body);

    const body: ApiResponse<typeof result> = {
      success: true,
      data: result,
    };

    res.status(200).json(body);
  },

  async refresh(req: Request, res: Response) {
    const token =
      req.body?.refreshToken ??
      req.cookies?.[REFRESH_COOKIE];

    if (!token) {
      throw AppError.unauthorized("No refresh token provided");
    }

    const tokens = await authService.refresh(
      token,
      getDeviceContext(req),
    );

    setRefreshCookie(res, tokens.refreshToken);

    const body: ApiResponse<{ accessToken: string }> = {
      success: true,
      data: {
        accessToken: tokens.accessToken,
      },
    };

    res.status(200).json(body);
  },

  async logout(req: Request, res: Response) {
    const token =
      req.body?.refreshToken ??
      req.cookies?.[REFRESH_COOKIE];

    if (token) {
      await authService.logout(token);
    }

    res.clearCookie(REFRESH_COOKIE, {
      path: "/api/auth",
    });

    const body: ApiResponse<{ loggedOut: true }> = {
      success: true,
      data: {
        loggedOut: true,
      },
    };

    res.status(200).json(body);
  },

  async logoutAll(req: Request, res: Response) {
    if (!req.auth) {
      throw AppError.unauthorized();
    }

    await authService.logoutAll(req.auth.userId);

    res.clearCookie(REFRESH_COOKIE, {
      path: "/api/auth",
    });

    res.clearCookie(env.TRUSTED_DEVICE_COOKIE_NAME, {
      path: "/api/auth",
    });

    const body: ApiResponse<{ loggedOut: true }> = {
      success: true,
      data: {
        loggedOut: true,
      },
    };

    res.status(200).json(body);
  },

  async listSessions(req: Request, res: Response) {
    if (!req.auth) {
      throw AppError.unauthorized();
    }

    const sessions = await authService.listSessions(
      req.auth.userId,
    );

    const body: ApiResponse<typeof sessions> = {
      success: true,
      data: sessions,
    };

    res.status(200).json(body);
  },

  async revokeSession(
    req: Request<SessionIdParam>,
    res: Response,
  ) {
    if (!req.auth) {
      throw AppError.unauthorized();
    }

    await authService.revokeSession(
      req.auth.userId,
      req.params.sessionId,
    );

    const body: ApiResponse<{ revoked: true }> = {
      success: true,
      data: {
        revoked: true,
      },
    };

    res.status(200).json(body);
  },

  async me(req: Request, res: Response) {
    if (!req.auth) {
      throw AppError.unauthorized();
    }

    const user = await authService.me(req.auth.userId);

    const body: ApiResponse<ReturnType<typeof toPublicUser>> = {
      success: true,
      data: toPublicUser(user),
    };

    res.status(200).json(body);
  },

  async sendVerification(
    req: Request<unknown, unknown, SendVerificationInput>,
    res: Response,
  ) {
    await authService.requestVerification({
      email: req.body?.email,
      authedUserId: req.auth?.userId,
    });

    // Always a generic response — never reveals whether
    // the account exists or is already verified.
    const body: ApiResponse<{ sent: true }> = {
      success: true,
      data: {
        sent: true,
      },
    };

    res.status(200).json(body);
  },

  async verifyEmail(
    req: Request<unknown, unknown, VerifyEmailInput>,
    res: Response,
  ) {
    await authService.verifyEmail(req.body.token);

    const body: ApiResponse<{ verified: true }> = {
      success: true,
      data: {
        verified: true,
      },
    };

    res.status(200).json(body);
  },

  /**
   * Forgot password
   *
   * Frontend sends:
   * {
   *   email: "user@example.com"
   * }
   *
   * The service is responsible for:
   * - finding the user
   * - generating reset token
   * - storing hashed token in PasswordResetToken
   * - sending reset email
   *
   * Response stays generic so account existence is not revealed.
   */
  async forgotPassword(
    req: Request<unknown, unknown, ForgotPasswordInput>,
    res: Response,
  ) {
    await authService.forgotPassword(req.body);

    const body: ApiResponse<{
      sent: true;
      message: string;
    }> = {
      success: true,
      data: {
        sent: true,
        message:
          "If an account exists with that email, a password reset link has been sent.",
      },
    };

    res.status(200).json(body);
  },

  /**
   * Reset password
   *
   * Frontend sends:
   * {
   *   token: "reset-token",
   *   password: "new-password"
   * }
   *
   * The service is responsible for:
   * - hashing the incoming token
   * - validating PasswordResetToken
   * - checking expiry / usedAt
   * - hashing the new password
   * - updating User.passwordHash
   * - marking the reset token as used
   * - optionally revoking existing sessions
   */
  async resetPassword(
    req: Request<unknown, unknown, ResetPasswordInput>,
    res: Response,
  ) {
    await authService.resetPassword(req.body);

    const body: ApiResponse<{
      reset: true;
      message: string;
    }> = {
      success: true,
      data: {
        reset: true,
        message: "Password has been reset successfully.",
      },
    };

    res.status(200).json(body);
  },

  async acceptInvitation(
    req: Request<unknown, unknown, AcceptInvitationInput>,
    res: Response,
  ) {
    const { user, tokens } =
      await invitationsService.accept(
        req.body,
        getDeviceContext(req),
      );

    setRefreshCookie(res, tokens.refreshToken);

    const body: ApiResponse<{
      user: ReturnType<typeof toPublicUser>;
      accessToken: string;
    }> = {
      success: true,
      data: {
        user: toPublicUser(user),
        accessToken: tokens.accessToken,
      },
    };

    res.status(201).json(body);
  },
};