import type { ApiKey } from "@prisma/client";

import type { ApiKeyScope, CreateApiKeyInput } from "./api-keys.schema";

import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { generateRawToken, hashToken } from "@/lib/security";

/** Visible, non-secret marker so a leaked key in a log or repo is recognisable (and scannable). */
export const API_KEY_PREFIX = "ssk_";
const MAX_ACTIVE_KEYS_PER_ORG = 25;
/** lastUsedAt is only rewritten if older than this, to avoid a DB write on every API call. */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

export interface AuthenticatedApiKey {
  keyId: string;
  orgId: string;
  scopes: ApiKeyScope[];
}

/** API key as exposed over the API — never includes the hash. */
export function toPublicApiKey(key: ApiKey) {
  const { keyHash, ...rest } = key;
  void keyHash;
  return rest;
}

export const apiKeysService = {
  async list(orgId: string) {
    const keys = await prisma.apiKey.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
    return keys.map(toPublicApiKey);
  },

  /** The raw key is returned exactly once; only its HMAC hash is stored. */
  async create(orgId: string, userId: string, input: CreateApiKeyInput) {
    const active = await prisma.apiKey.count({ where: { orgId, revokedAt: null } });
    if (active >= MAX_ACTIVE_KEYS_PER_ORG) {
      throw AppError.validation(`You can have at most ${MAX_ACTIVE_KEYS_PER_ORG} active API keys`);
    }

    const raw = `${API_KEY_PREFIX}${generateRawToken(32)}`;

    const record = await prisma.apiKey.create({
      data: {
        orgId,
        name: input.name,
        keyPrefix: raw.slice(0, API_KEY_PREFIX.length + 6),
        keyHash: hashToken(raw),
        scopes: input.scopes,
        createdById: userId,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60_000) : null,
      },
    });

    await recordAudit({
      orgId,
      actorId: userId,
      action: "api_key.created",
      targetType: "api_key",
      targetId: record.id,
      metadata: { name: record.name, scopes: record.scopes },
    });

    return { key: raw, apiKey: toPublicApiKey(record) };
  },

  async revoke(orgId: string, userId: string, id: string) {
    const existing = await prisma.apiKey.findFirst({ where: { id, orgId } });
    if (!existing) throw AppError.notFound("API key not found");

    if (!existing.revokedAt) {
      await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
      await recordAudit({ orgId, actorId: userId, action: "api_key.revoked", targetType: "api_key", targetId: id });
    }
  },

  /** Resolves a presented key to its org + scopes, or null when it is unknown, revoked or expired. */
  async authenticate(rawKey: string): Promise<AuthenticatedApiKey | null> {
    if (!rawKey.startsWith(API_KEY_PREFIX)) return null;

    const record = await prisma.apiKey.findUnique({ where: { keyHash: hashToken(rawKey) } });
    if (!record || record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt <= new Date()) return null;

    if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS) {
      prisma.apiKey
        .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
        .catch((err: unknown) => logger.warn({ err }, "Failed to update API key lastUsedAt"));
    }

    return { keyId: record.id, orgId: record.orgId, scopes: record.scopes as ApiKeyScope[] };
  },
};
