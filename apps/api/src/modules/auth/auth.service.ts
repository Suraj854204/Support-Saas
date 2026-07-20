import {
  createHash,
  randomBytes,
} from "node:crypto";

import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "./auth.schema";

import { AppError } from "@/lib/app-error";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendPasswordResetEmail } from "@/services/mail.service";

const BCRYPT_ROUNDS = 12;

const REFRESH_TOKEN_PREFIX = "refresh_token:";
const REFRESH_TTL_SECONDS =
  30 * 24 * 60 * 60;

const DEFAULT_RESET_EXPIRY_MINUTES = 15;
const MAX_RESET_EXPIRY_MINUTES = 60;

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

function hashResetToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function getPasswordResetExpiryMinutes(): number {
  const configuredValue = Number(
    process.env.PASSWORD_RESET_EXPIRES_MINUTES ??
      DEFAULT_RESET_EXPIRY_MINUTES,
  );

  if (
    !Number.isFinite(configuredValue) ||
    configuredValue <= 0
  ) {
    return DEFAULT_RESET_EXPIRY_MINUTES;
  }

  return Math.min(
    Math.floor(configuredValue),
    MAX_RESET_EXPIRY_MINUTES,
  );
}

function getFrontendUrl(): string {
  const frontendUrl =
    process.env.FRONTEND_URL?.trim();

  if (!frontendUrl) {
    throw AppError.internal(
      "FRONTEND_URL is not configured",
    );
  }

  try {
    return new URL(frontendUrl).toString();
  } catch {
    throw AppError.internal(
      "FRONTEND_URL is invalid",
    );
  }
}

async function issueTokenPair(user: {
  id: string;
  orgId: string;
  role: import("@support-saas/shared-types").UserRole;
}) {
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

  await redis.set(
    `${REFRESH_TOKEN_PREFIX}${tokenId}`,
    user.id,
    "EX",
    REFRESH_TTL_SECONDS,
  );

  return {
    accessToken,
    refreshToken,
  };
}

export const authService = {
  async register(input: RegisterInput) {
    const existing =
      await prisma.user.findFirst({
        where: {
          email: input.email,
        },
      });

    if (existing) {
      throw AppError.conflict(
        "An account with this email already exists",
      );
    }

    const passwordHash = await bcrypt.hash(
      input.password,
      BCRYPT_ROUNDS,
    );

    const { user, org } =
      await prisma.$transaction(
        async (
          tx: Prisma.TransactionClient,
        ) => {
          const org =
            await tx.organization.create({
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
        },
      );

    const tokens = await issueTokenPair({
      id: user.id,
      orgId: user.orgId,
      role: user.role,
    });

    return {
      user,
      org,
      tokens,
    };
  },

  async login(input: LoginInput) {
    const user =
      await prisma.user.findFirst({
        where: {
          email: input.email,
        },
      });

    if (!user || !user.isActive) {
      throw AppError.unauthorized(
        "Invalid email or password",
      );
    }

    const validPassword =
      await bcrypt.compare(
        input.password,
        user.passwordHash,
      );

    if (!validPassword) {
      throw AppError.unauthorized(
        "Invalid email or password",
      );
    }

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastSeenAt: new Date(),
      },
    });

    const tokens = await issueTokenPair({
      id: user.id,
      orgId: user.orgId,
      role: user.role,
    });

    return {
      user,
      tokens,
    };
  },

  async forgotPassword(
    input: ForgotPasswordInput,
  ): Promise<void> {
    const normalizedEmail = input.email
      .trim()
      .toLowerCase();

    const user =
      await prisma.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: "insensitive",
          },
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

    /*
     * Account exist na kare tab bhi successful
     * generic response return karna hai.
     *
     * Isse attackers registered emails identify
     * nahi kar sakte.
     */
    if (!user) {
      return;
    }

    const expiresInMinutes =
      getPasswordResetExpiryMinutes();

    const rawToken = randomBytes(32).toString(
      "hex",
    );

    const tokenHash =
      hashResetToken(rawToken);

    const expiresAt = new Date(
      Date.now() +
        expiresInMinutes * 60 * 1000,
    );

    /*
     * Purane reset tokens delete karke
     * sirf newest reset link valid rakha jayega.
     */
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: user.id,
        },
      }),

      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const resetUrl = new URL(
      "/reset-password",
      getFrontendUrl(),
    );

    resetUrl.searchParams.set(
      "token",
      rawToken,
    );

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: resetUrl.toString(),
        expiresInMinutes,
      });
    } catch (error) {
      /*
       * Mail sending fail ho jaye to generated
       * reset token ko database se remove karo.
       */
      await prisma.passwordResetToken.deleteMany(
        {
          where: {
            userId: user.id,
            tokenHash,
          },
        },
      );

      console.error(
        "Password reset email sending failed",
        {
          userId: user.id,
          error:
            error instanceof Error
              ? error.message
              : "Unknown email service error",
        },
      );

      throw AppError.internal(
        "Password reset email could not be sent",
      );
    }
  },

  async resetPassword(
    input: ResetPasswordInput,
  ): Promise<{ message: string }> {
    const rawToken = input.token.trim();

    if (!rawToken) {
      throw AppError.unauthorized(
        "This password reset link is invalid or has expired",
      );
    }

    const tokenHash =
      hashResetToken(rawToken);

    const resetToken =
      await prisma.passwordResetToken.findUnique(
        {
          where: {
            tokenHash,
          },
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            user: {
              select: {
                id: true,
                isActive: true,
              },
            },
          },
        },
      );

    if (
      !resetToken ||
      !resetToken.user.isActive ||
      resetToken.expiresAt.getTime() <=
        Date.now()
    ) {
      /*
       * Expired token database mein mil gaya to
       * cleanup kar do.
       */
      if (resetToken) {
        await prisma.passwordResetToken.delete({
          where: {
            id: resetToken.id,
          },
        });
      }

      throw AppError.unauthorized(
        "This password reset link is invalid or has expired",
      );
    }

    const passwordHash = await bcrypt.hash(
      input.password,
      BCRYPT_ROUNDS,
    );

    /*
     * Password update aur reset-token deletion
     * ek atomic transaction mein hoga.
     *
     * Successful reset ke baad user ke saare
     * reset links invalid ho jayenge.
     */
    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: resetToken.userId,
        },
        data: {
          passwordHash,
        },
      }),

      prisma.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
        },
      }),
    ]);

    return {
      message:
        "Your password has been reset successfully. You can now sign in.",
    };
  },

  async refresh(refreshToken: string) {
    let payload;

    try {
      payload =
        verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized(
        "Invalid or expired refresh token",
      );
    }

    const storedUserId = await redis.get(
      `${REFRESH_TOKEN_PREFIX}${payload.tokenId}`,
    );

    if (
      !storedUserId ||
      storedUserId !== payload.sub
    ) {
      throw AppError.unauthorized(
        "Refresh token has been revoked",
      );
    }

    await redis.del(
      `${REFRESH_TOKEN_PREFIX}${payload.tokenId}`,
    );

    const user =
      await prisma.user.findUnique({
        where: {
          id: payload.sub,
        },
      });

    if (!user || !user.isActive) {
      throw AppError.unauthorized(
        "Account no longer active",
      );
    }

    return issueTokenPair({
      id: user.id,
      orgId: user.orgId,
      role: user.role,
    });
  },

  async logout(refreshToken: string) {
    try {
      const payload =
        verifyRefreshToken(refreshToken);

      await redis.del(
        `${REFRESH_TOKEN_PREFIX}${payload.tokenId}`,
      );
    } catch {
      /*
       * Invalid ya expired token ke case mein bhi
       * logout ko successful treat kiya jayega.
       */
    }
  },

  async me(userId: string) {
    const user =
      await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    if (!user) {
      throw AppError.notFound(
        "User not found",
      );
    }

    return user;
  },
};