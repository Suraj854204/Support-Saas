import type {
  ApiResponse,
} from "@support-saas/shared-types";
import type {
  Request,
  Response,
} from "express";

import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "./auth.schema";
import { authService } from "./auth.service";

import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";
import { toPublicUser } from "@/modules/users/user.serializer";

const REFRESH_COOKIE = "refresh_token";

const REFRESH_COOKIE_MAX_AGE_MS =
  30 * 24 * 60 * 60 * 1000;

function setRefreshCookie(
  res: Response,
  token: string,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: "/api/auth",
  });
}

export const authController = {
  async register(
    req: Request<
      unknown,
      unknown,
      RegisterInput
    >,
    res: Response,
  ): Promise<void> {
    const { user, org, tokens } =
      await authService.register(req.body);

    setRefreshCookie(
      res,
      tokens.refreshToken,
    );

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
    req: Request<
      unknown,
      unknown,
      LoginInput
    >,
    res: Response,
  ): Promise<void> {
    const { user, tokens } =
      await authService.login(req.body);

    setRefreshCookie(
      res,
      tokens.refreshToken,
    );

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

  async forgotPassword(
    req: Request<
      unknown,
      unknown,
      ForgotPasswordInput
    >,
    res: Response,
  ): Promise<void> {
    await authService.forgotPassword(
      req.body,
    );

    const body: ApiResponse<{
      message: string;
    }> = {
      success: true,
      data: {
        message:
          "If an account exists for this email, a password reset link has been sent.",
      },
    };

    res.status(200).json(body);
  },

  async resetPassword(
    req: Request<
      unknown,
      unknown,
      ResetPasswordInput
    >,
    res: Response,
  ): Promise<void> {
    const result =
      await authService.resetPassword(
        req.body,
      );

    const body: ApiResponse<{
      message: string;
    }> = {
      success: true,
      data: result,
    };

    res.status(200).json(body);
  },

  async refresh(
    req: Request,
    res: Response,
  ): Promise<void> {
    const token =
      req.body?.refreshToken ??
      req.cookies?.[REFRESH_COOKIE];

    if (!token) {
      throw AppError.unauthorized(
        "No refresh token provided",
      );
    }

    const tokens =
      await authService.refresh(token);

    setRefreshCookie(
      res,
      tokens.refreshToken,
    );

    const body: ApiResponse<{
      accessToken: string;
    }> = {
      success: true,
      data: {
        accessToken: tokens.accessToken,
      },
    };

    res.status(200).json(body);
  },

  async logout(
    req: Request,
    res: Response,
  ): Promise<void> {
    const token =
      req.body?.refreshToken ??
      req.cookies?.[REFRESH_COOKIE];

    if (token) {
      await authService.logout(token);
    }

    res.clearCookie(REFRESH_COOKIE, {
      path: "/api/auth",
    });

    const body: ApiResponse<{
      loggedOut: true;
    }> = {
      success: true,
      data: {
        loggedOut: true,
      },
    };

    res.status(200).json(body);
  },

  async me(
    req: Request,
    res: Response,
  ): Promise<void> {
    if (!req.auth) {
      throw AppError.unauthorized();
    }

    const user = await authService.me(
      req.auth.userId,
    );

    const body: ApiResponse<
      ReturnType<typeof toPublicUser>
    > = {
      success: true,
      data: toPublicUser(user),
    };

    res.status(200).json(body);
  },
};