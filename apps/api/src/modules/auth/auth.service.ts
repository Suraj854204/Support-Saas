import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

import type { LoginInput, RegisterInput } from "./auth.schema";

import { AppError } from "@/lib/app-error";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";


const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_PREFIX = "refresh_token:";
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days, mirrors JWT_REFRESH_TTL

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 7)
  );
}

async function issueTokenPair(user: { id: string; orgId: string; role: import("@support-saas/shared-types").UserRole }) {
  const accessToken = signAccessToken({ sub: user.id, orgId: user.orgId, role: user.role });

  const tokenId = uuid();
  const refreshToken = signRefreshToken({ sub: user.id, orgId: user.orgId, tokenId });

  // Store the refresh token id -> userId so it can be revoked/rotated and
  // so a stolen-but-not-yet-expired token can be invalidated on logout.
  await redis.set(`${REFRESH_TOKEN_PREFIX}${tokenId}`, user.id, "EX", REFRESH_TTL_SECONDS);

  return { accessToken, refreshToken };
}

export const authService = {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findFirst({ where: { email: input.email } });
    if (existing) {
      throw AppError.conflict("An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const { user, org } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const org = await tx.organization.create({
        data: { name: input.orgName, slug: slugify(input.orgName) },
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

      return { user, org };
    });

    const tokens = await issueTokenPair({ id: user.id, orgId: user.orgId, role: user.role });
    return { user, org, tokens };
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findFirst({ where: { email: input.email } });
    if (!user || !user.isActive) {
      throw AppError.unauthorized("Invalid email or password");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw AppError.unauthorized("Invalid email or password");
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

    const tokens = await issueTokenPair({ id: user.id, orgId: user.orgId, role: user.role });
    return { user, tokens };
  },

  async refresh(refreshToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized("Invalid or expired refresh token");
    }

    const storedUserId = await redis.get(`${REFRESH_TOKEN_PREFIX}${payload.tokenId}`);
    if (!storedUserId || storedUserId !== payload.sub) {
      throw AppError.unauthorized("Refresh token has been revoked");
    }

    // Rotate: invalidate the old token id immediately so it can't be replayed
    await redis.del(`${REFRESH_TOKEN_PREFIX}${payload.tokenId}`);

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw AppError.unauthorized("Account no longer active");
    }

    return issueTokenPair({ id: user.id, orgId: user.orgId, role: user.role });
  },

  async logout(refreshToken: string) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await redis.del(`${REFRESH_TOKEN_PREFIX}${payload.tokenId}`);
    } catch {
      // Already invalid/expired — logout is idempotent either way.
    }
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound("User not found");
    return user;
  },
};
