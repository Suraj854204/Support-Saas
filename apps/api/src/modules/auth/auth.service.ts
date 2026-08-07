import type { Prisma, User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendLoginOtpInput,
  ResetPasswordInput,
  VerifyLoginOtpInput,
} from "./auth.schema";

import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/jwt";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import {
  generateOtp,
  generatePublicId,
  generateRawToken,
  hashOtp,
  hashToken,
  maskEmail,
  timingSafeEqual,
} from "@/lib/security";
import { loginOtpTemplate } from "@/services/email-templates/login-otp.template";
import { verificationTemplate } from "@/services/email-templates/verification.template";
import { mailService } from "@/services/mail.service";

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_PREFIX = "refresh_token:";
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days, mirrors JWT_REFRESH_TTL

// Password reset token lifetime.
// 60 minutes is a reasonable default for a password reset link.
const PASSWORD_RESET_TTL_MINUTES = 60;

export interface DeviceContext {
  ipAddress?: string;
  userAgent?: string;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

export async function issueTokenPair(
  user: {
    id: string;
    orgId: string;
    role: import("@support-saas/shared-types").UserRole;
  },
  ctx: DeviceContext = {}
) {
  const accessToken = signAccessToken({
    sub: user.id,
    orgId: user.orgId,
    role: user.role,
  });

  const tokenId = uuid();

  const refreshToken = signRefreshToken({
    sub: user.id,
    orgId: user.orgId,
    tokenId,
  });

  // Store the refresh token id -> userId so it can be revoked/rotated and
  // so a stolen-but-not-yet-expired token can be invalidated on logout.
  await redis.set(
    `${REFRESH_TOKEN_PREFIX}${tokenId}`,
    user.id,
    "EX",
    REFRESH_TTL_SECONDS
  );

  // Mirror the live refresh token in Postgres so "GET /sessions" and
  // "logout everywhere" have something durable and listable to act on —
  // Redis alone can't be enumerated per-user without a costly SCAN.
  await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshTokenId: tokenId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
  });

  return {
    accessToken,
    refreshToken,
  };
}

async function recordLoginActivity(input: {
  userId?: string;
  email: string;
  success: boolean;
  reason?: string;
  ctx?: DeviceContext;
}) {
  try {
    await prisma.loginActivity.create({
      data: {
        userId: input.userId,
        email: input.email,
        success: input.success,
        reason: input.reason,
        ipAddress: input.ctx?.ipAddress,
        userAgent: input.ctx?.userAgent,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to record login activity");
  }
}

async function createLoginOtpChallenge(
  user: User,
  ctx: DeviceContext,
  rememberDevice: boolean
) {
  const otp = generateOtp();
  const challengeId = generatePublicId();
  const expiresAt = new Date(
    Date.now() + env.LOGIN_OTP_TTL_SECONDS * 1000
  );

  await prisma.loginOtpChallenge.create({
    data: {
      challengeId,
      userId: user.id,
      otpHash: hashOtp(otp),
      maxAttempts: env.LOGIN_OTP_MAX_ATTEMPTS,
      expiresAt,
      rememberDevice,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
  });

  const { subject, html, text } = loginOtpTemplate({
    name: user.name,
    otp,
    expiresInMinutes: Math.round(env.LOGIN_OTP_TTL_SECONDS / 60),
  });

  await mailService.send({
    to: user.email,
    subject,
    html,
    text,
  });

  return {
    challengeId,
  };
}

export const authService = {
  // -------------------------------------------------------------------------
  // Register
  // -------------------------------------------------------------------------

  async register(
    input: RegisterInput,
    ctx: DeviceContext = {}
  ) {
    const existing = await prisma.user.findFirst({
      where: {
        email: input.email,
      },
    });

    if (existing) {
      throw AppError.conflict(
        "An account with this email already exists"
      );
    }

    const passwordHash = await bcrypt.hash(
      input.password,
      BCRYPT_ROUNDS
    );

    const { user, org } = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const org = await tx.organization.create({
          data: {
            name: input.orgName,
            slug: slugify(input.orgName),
          },
        });

        const user = await tx.user.create({
          data: {
            orgId: org.id,
            email: input.email,
            passwordHash,
            name: input.name,
            role: "owner",
          },
        });

        return {
          user,
          org,
        };
      }
    );

    const tokens = await issueTokenPair(
      {
        id: user.id,
        orgId: user.orgId,
        role: user.role,
      },
      ctx
    );

    try {
      await authService.sendVerificationEmail(user);
    } catch (err) {
      // Registration must succeed even if the verification email fails to
      // send — the owner can always hit "resend verification" later.
      logger.error(
        { err },
        "Failed to send verification email on registration"
      );
    }

    return {
      user,
      org,
      tokens,
    };
  },

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  /**
   * Step 1 of login: verify the password, then either (a) skip straight to
   * issuing tokens if a valid trusted-device token accompanies the request,
   * or (b) issue an OTP challenge and email a 6-digit code.
   */
  async login(
    input: LoginInput,
    ctx: DeviceContext & {
      trustedDeviceToken?: string;
    } = {}
  ) {
    const user = await prisma.user.findFirst({
      where: {
        email: input.email,
      },
    });

    if (!user || !user.isActive) {
      await recordLoginActivity({
        email: input.email,
        success: false,
        reason: "invalid_credentials",
        ctx,
      });

      throw AppError.unauthorized(
        "Invalid email or password"
      );
    }

    const valid = await bcrypt.compare(
      input.password,
      user.passwordHash
    );

    if (!valid) {
      await recordLoginActivity({
        userId: user.id,
        email: input.email,
        success: false,
        reason: "invalid_credentials",
        ctx,
      });

      throw AppError.unauthorized(
        "Invalid email or password"
      );
    }

    if (ctx.trustedDeviceToken) {
      const tokenHash = hashToken(
        ctx.trustedDeviceToken
      );

      const device =
        await prisma.trustedDevice.findUnique({
          where: {
            tokenHash,
          },
        });

      const isValidDevice =
        device &&
        device.userId === user.id &&
        !device.revokedAt &&
        device.expiresAt > new Date();

      if (isValidDevice) {
        await prisma.trustedDevice.update({
          where: {
            id: device.id,
          },
          data: {
            lastUsedAt: new Date(),
          },
        });

        await prisma.user.update({
          where: {
            id: user.id,
          },
          data: {
            lastSeenAt: new Date(),
          },
        });

        const tokens = await issueTokenPair(
          user,
          ctx
        );

        await recordLoginActivity({
          userId: user.id,
          email: user.email,
          success: true,
          reason: "trusted_device",
          ctx,
        });

        return {
          requiresOtp: false as const,
          user,
          tokens,
        };
      }
    }

    const challenge = await createLoginOtpChallenge(
      user,
      ctx,
      false
    );

    return {
      requiresOtp: true as const,
      challengeId: challenge.challengeId,
      maskedEmail: maskEmail(user.email),
      expiresInSeconds: env.LOGIN_OTP_TTL_SECONDS,
    };
  },

  // -------------------------------------------------------------------------
  // Login OTP
  // -------------------------------------------------------------------------

  async resendLoginOtp(
    input: ResendLoginOtpInput
  ) {
    const challenge =
      await prisma.loginOtpChallenge.findUnique({
        where: {
          challengeId: input.challengeId,
        },
      });

    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt < new Date()
    ) {
      throw AppError.unauthorized(
        "This sign-in session has expired. Please log in again."
      );
    }

    const secondsSinceLastSend =
      (Date.now() - challenge.lastSentAt.getTime()) /
      1000;

    if (
      secondsSinceLastSend <
      env.LOGIN_OTP_RESEND_COOLDOWN_SECONDS
    ) {
      throw AppError.rateLimited(
        `Please wait ${Math.ceil(
          env.LOGIN_OTP_RESEND_COOLDOWN_SECONDS -
            secondsSinceLastSend
        )}s before requesting another code.`
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        id: challenge.userId,
      },
    });

    if (!user || !user.isActive) {
      throw AppError.unauthorized(
        "This sign-in session is no longer valid. Please log in again."
      );
    }

    const otp = generateOtp();

    const expiresAt = new Date(
      Date.now() +
        env.LOGIN_OTP_TTL_SECONDS * 1000
    );

    await prisma.loginOtpChallenge.update({
      where: {
        id: challenge.id,
      },
      data: {
        otpHash: hashOtp(otp),
        attempts: 0,
        expiresAt,
        lastSentAt: new Date(),
      },
    });

    const { subject, html, text } =
      loginOtpTemplate({
        name: user.name,
        otp,
        expiresInMinutes: Math.round(
          env.LOGIN_OTP_TTL_SECONDS / 60
        ),
      });

    await mailService.send({
      to: user.email,
      subject,
      html,
      text,
    });

    return {
      challengeId: challenge.challengeId,
      maskedEmail: maskEmail(user.email),
      expiresInSeconds:
        env.LOGIN_OTP_TTL_SECONDS,
    };
  },

  async verifyLoginOtp(
    input: VerifyLoginOtpInput,
    ctx: DeviceContext = {}
  ) {
    const challenge =
      await prisma.loginOtpChallenge.findUnique({
        where: {
          challengeId: input.challengeId,
        },
      });

    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt < new Date()
    ) {
      throw AppError.unauthorized(
        "This code has expired. Please log in again."
      );
    }

    if (
      challenge.attempts >=
      challenge.maxAttempts
    ) {
      throw AppError.unauthorized(
        "Too many incorrect attempts. Please log in again."
      );
    }

    const matches = timingSafeEqual(
      hashOtp(input.otp),
      challenge.otpHash
    );

    if (!matches) {
      await prisma.loginOtpChallenge.update({
        where: {
          id: challenge.id,
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      throw AppError.unauthorized(
        "Incorrect verification code"
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        id: challenge.userId,
      },
    });

    if (!user || !user.isActive) {
      throw AppError.unauthorized(
        "Account no longer active"
      );
    }

    await prisma.loginOtpChallenge.update({
      where: {
        id: challenge.id,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    // Defense in depth: a fresh code invalidates every other pending
    // challenge for this user, even ones from a different device/tab.
    await prisma.loginOtpChallenge.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
        id: {
          not: challenge.id,
        },
      },
      data: {
        consumedAt: new Date(),
      },
    });

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastSeenAt: new Date(),
      },
    });

    const tokens = await issueTokenPair(
      user,
      ctx
    );

    await recordLoginActivity({
      userId: user.id,
      email: user.email,
      success: true,
      reason: "otp_verified",
      ctx,
    });

    let trustedDeviceToken: string | undefined;

    if (input.rememberDevice) {
      trustedDeviceToken =
        generateRawToken(32);

      await prisma.trustedDevice.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(
            trustedDeviceToken
          ),
          expiresAt: new Date(
            Date.now() +
              env.TRUSTED_DEVICE_TTL_DAYS *
                24 *
                60 *
                60 *
                1000
          ),
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
      });
    }

    return {
      user,
      tokens,
      trustedDeviceToken,
    };
  },

  // -------------------------------------------------------------------------
  // Refresh
  // -------------------------------------------------------------------------

  async refresh(
    refreshToken: string,
    ctx: DeviceContext = {}
  ) {
    let payload;

    try {
      payload =
        verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized(
        "Invalid or expired refresh token"
      );
    }

    const storedUserId = await redis.get(
      `${REFRESH_TOKEN_PREFIX}${payload.tokenId}`
    );

    if (
      !storedUserId ||
      storedUserId !== payload.sub
    ) {
      throw AppError.unauthorized(
        "Refresh token has been revoked"
      );
    }

    // Rotate: invalidate the old token id immediately so it can't be replayed
    await redis.del(
      `${REFRESH_TOKEN_PREFIX}${payload.tokenId}`
    );

    await prisma.userSession.updateMany({
      where: {
        refreshTokenId: payload.tokenId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
    });

    if (!user || !user.isActive) {
      throw AppError.unauthorized(
        "Account no longer active"
      );
    }

    return issueTokenPair(user, ctx);
  },

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  async logout(refreshToken: string) {
    try {
      const payload =
        verifyRefreshToken(refreshToken);

      await redis.del(
        `${REFRESH_TOKEN_PREFIX}${payload.tokenId}`
      );

      await prisma.userSession.updateMany({
        where: {
          refreshTokenId: payload.tokenId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch {
      // Already invalid/expired — logout is idempotent either way.
    }
  },

  async logoutAll(userId: string) {
    const sessions =
      await prisma.userSession.findMany({
        where: {
          userId,
          revokedAt: null,
        },
      });

    await Promise.all(
      sessions.map((s) =>
        redis.del(
          `${REFRESH_TOKEN_PREFIX}${s.refreshTokenId}`
        )
      )
    );

    await prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  },

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  async listSessions(userId: string) {
    return prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      orderBy: {
        lastUsedAt: "desc",
      },
    });
  },

  async revokeSession(
    userId: string,
    sessionId: string
  ) {
    const session =
      await prisma.userSession.findUnique({
        where: {
          id: sessionId,
        },
      });

    if (
      !session ||
      session.userId !== userId
    ) {
      throw AppError.notFound(
        "Session not found"
      );
    }

    await redis.del(
      `${REFRESH_TOKEN_PREFIX}${session.refreshTokenId}`
    );

    await prisma.userSession.update({
      where: {
        id: sessionId,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  },

  // -------------------------------------------------------------------------
  // Current user
  // -------------------------------------------------------------------------

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw AppError.notFound(
        "User not found"
      );
    }

    return user;
  },

  // -------------------------------------------------------------------------
  // Feature 2: Email verification
  // -------------------------------------------------------------------------

  async sendVerificationEmail(user: User) {
    // Invalidate any previously-issued unused links first — only the most
    // recent verification link should ever be valid.
    await prisma.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    const raw = generateRawToken(32);

    const expiresAt = new Date(
      Date.now() +
        env.EMAIL_VERIFICATION_TTL_HOURS *
          60 *
          60 *
          1000
    );

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt,
      },
    });

    const verifyUrl =
      `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${raw}`;

    const {
      subject,
      html,
      text,
    } = verificationTemplate({
      name: user.name,
      verifyUrl,
      expiresInHours:
        env.EMAIL_VERIFICATION_TTL_HOURS,
    });

    await mailService.send({
      to: user.email,
      subject,
      html,
      text,
    });
  },

  /** Generic outcome regardless of match, to avoid leaking account existence/verification state. */
  async requestVerification(opts: {
    email?: string;
    authedUserId?: string;
  }) {
    const user = opts.authedUserId
      ? await prisma.user.findUnique({
          where: {
            id: opts.authedUserId,
          },
        })
      : opts.email
        ? await prisma.user.findFirst({
            where: {
              email: opts.email,
            },
          })
        : null;

    if (
      user &&
      !user.emailVerifiedAt
    ) {
      try {
        await authService.sendVerificationEmail(
          user
        );
      } catch (err) {
        logger.error(
          { err },
          "Failed to send verification email"
        );
      }
    }
  },

  async verifyEmail(token: string) {
    const record =
      await prisma.emailVerificationToken.findUnique(
        {
          where: {
            tokenHash: hashToken(token),
          },
        }
      );

    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw AppError.validation(
        "This verification link is invalid or has expired."
      );
    }

    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: {
          id: record.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),

      prisma.user.update({
        where: {
          id: record.userId,
        },
        data: {
          emailVerifiedAt: new Date(),
        },
      }),
    ]);
  },

  // -------------------------------------------------------------------------
  // Feature 3: Forgot password
  // -------------------------------------------------------------------------

  /**
   * Request a password reset link.
   *
   * IMPORTANT:
   * This method intentionally returns the same result whether the email
   * exists or not. This prevents account/email enumeration.
   */
  async forgotPassword(
    input: ForgotPasswordInput
  ) {
    const genericResponse = {
      sent: true as const,
    };

    const user = await prisma.user.findFirst({
      where: {
        email: input.email,
      },
    });

    // Do not reveal whether the account exists.
    if (!user || !user.isActive) {
      return genericResponse;
    }

    try {
      // Invalidate previous unused reset tokens.
      await prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      // Generate a random token.
      // Only the hash is stored in the database.
      const rawToken = generateRawToken(32);
      const tokenHash = hashToken(rawToken);

      const expiresAt = new Date(
        Date.now() +
          PASSWORD_RESET_TTL_MINUTES *
            60 *
            1000
      );

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      const resetUrl =
        `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(
          rawToken
        )}`;

      const subject =
        "Reset your password";

      const text = [
        `Hi ${user.name},`,
        "",
        "We received a request to reset your password.",
        "",
        `Reset your password here: ${resetUrl}`,
        "",
        `This link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`,
        "",
        "If you did not request a password reset, you can safely ignore this email.",
      ].join("\n");

      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h2>Reset your password</h2>

          <p>Hi ${escapeHtml(user.name)},</p>

          <p>
            We received a request to reset your password.
          </p>

          <p>
            <a
              href="${escapeHtml(resetUrl)}"
              style="
                display: inline-block;
                padding: 12px 20px;
                background: #111827;
                color: #ffffff;
                text-decoration: none;
                border-radius: 6px;
              "
            >
              Reset Password
            </a>
          </p>

          <p>
            This link expires in
            <strong>${PASSWORD_RESET_TTL_MINUTES} minutes</strong>.
          </p>

          <p>
            If you did not request a password reset,
            you can safely ignore this email.
          </p>
        </div>
      `;

      await mailService.send({
        to: user.email,
        subject,
        html,
        text,
      });
    } catch (err) {
      // Do not expose internal email/database errors to the client.
      logger.error(
        { err, email: input.email },
        "Failed to process password reset request"
      );
    }

    return genericResponse;
  },

  // -------------------------------------------------------------------------
  // Reset password
  // -------------------------------------------------------------------------

  /**
   * Consume a password reset token and replace the user's password.
   *
   * The reset token is:
   * - hashed before database lookup
   * - single-use
   * - time-limited
   * - invalidated after successful use
   *
   * All existing sessions are revoked after a successful password reset.
   */
  async resetPassword(
    input: ResetPasswordInput
  ) {
    const tokenHash = hashToken(
      input.token
    );

    const record =
      await prisma.passwordResetToken.findUnique(
        {
          where: {
            tokenHash,
          },
        }
      );

    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw AppError.validation(
        "This password reset link is invalid or has expired."
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        id: record.userId,
      },
    });

    if (!user || !user.isActive) {
      throw AppError.validation(
        "This password reset link is no longer valid."
      );
    }

    const passwordHash =
      await bcrypt.hash(
        input.password,
        BCRYPT_ROUNDS
      );

    const now = new Date();

    await prisma.$transaction(
      async (tx) => {
        // Mark this token as consumed.
        const consumed =
          await tx.passwordResetToken.updateMany({
            where: {
              id: record.id,
              usedAt: null,
            },
            data: {
              usedAt: now,
            },
          });

        // Protect against two simultaneous requests
        // trying to consume the same reset token.
        if (consumed.count !== 1) {
          throw AppError.validation(
            "This password reset link is invalid or has already been used."
          );
        }

        // Change password.
        await tx.user.update({
          where: {
            id: user.id,
          },
          data: {
            passwordHash,
          },
        });

        // Invalidate any other outstanding reset tokens.
        await tx.passwordResetToken.updateMany({
          where: {
            userId: user.id,
            usedAt: null,
          },
          data: {
            usedAt: now,
          },
        });
      }
    );

    // Security: changing the password logs the user out
    // from all existing sessions/devices.
    await authService.logoutAll(
      user.id
    );

    return {
      reset: true as const,
    };
  },
};

// -----------------------------------------------------------------------------
// Small HTML escaping helper used by the password reset email.
// -----------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}