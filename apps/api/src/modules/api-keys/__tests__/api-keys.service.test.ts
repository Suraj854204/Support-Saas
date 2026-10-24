import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  apiKey: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { API_KEY_PREFIX, apiKeysService, toPublicApiKey } from "../api-keys.service";

import { hashToken } from "@/lib/security";


const NOW = Date.now();

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "k1",
    orgId: "org1",
    name: "CI",
    keyPrefix: "ssk_abcdef",
    keyHash: "hash",
    scopes: ["tickets:read"],
    createdById: "u1",
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(NOW),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.apiKey.update.mockResolvedValue({});
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("apiKeysService.create", () => {
  it("returns the raw key once and persists only its hash", async () => {
    prismaMock.apiKey.count.mockResolvedValue(0);
    prismaMock.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "k1",
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
      ...data,
    }));

    const { key, apiKey } = await apiKeysService.create("org1", "u1", { name: "CI", scopes: ["tickets:write"] });

    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(key.length).toBeGreaterThan(40);

    const stored = (prismaMock.apiKey.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(stored.keyHash).toBe(hashToken(key));
    expect(JSON.stringify(stored)).not.toContain(key);
    expect(stored.keyPrefix).toBe(key.slice(0, API_KEY_PREFIX.length + 6));
    expect(stored.orgId).toBe("org1");

    expect(apiKey).not.toHaveProperty("keyHash");
  });

  it("generates a different key every time", async () => {
    prismaMock.apiKey.count.mockResolvedValue(0);
    prismaMock.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "k", ...data }));

    const a = await apiKeysService.create("org1", "u1", { name: "a", scopes: ["tickets:read"] });
    const b = await apiKeysService.create("org1", "u1", { name: "b", scopes: ["tickets:read"] });
    expect(a.key).not.toBe(b.key);
  });

  it("applies an expiry when requested", async () => {
    prismaMock.apiKey.count.mockResolvedValue(0);
    prismaMock.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "k", ...data }));

    await apiKeysService.create("org1", "u1", { name: "temp", scopes: ["tickets:read"], expiresInDays: 7 });

    const stored = (prismaMock.apiKey.create.mock.calls[0]?.[0] as { data: { expiresAt: Date } }).data;
    const days = (stored.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("caps the number of active keys per org", async () => {
    prismaMock.apiKey.count.mockResolvedValue(25);

    await expect(apiKeysService.create("org1", "u1", { name: "x", scopes: ["tickets:read"] })).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(prismaMock.apiKey.create).not.toHaveBeenCalled();
  });
});

describe("apiKeysService.authenticate", () => {
  const raw = `${API_KEY_PREFIX}some-secret-value`;

  it("rejects strings without the key prefix without touching the database", async () => {
    expect(await apiKeysService.authenticate("eyJhbGciOi.jwt.token")).toBeNull();
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("looks the key up by its hash, never by the raw value", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(null);

    await apiKeysService.authenticate(raw);

    expect(prismaMock.apiKey.findUnique).toHaveBeenCalledWith({ where: { keyHash: hashToken(raw) } });
  });

  it("returns null for unknown, revoked and expired keys", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValueOnce(null);
    expect(await apiKeysService.authenticate(raw)).toBeNull();

    prismaMock.apiKey.findUnique.mockResolvedValueOnce(record({ revokedAt: new Date() }));
    expect(await apiKeysService.authenticate(raw)).toBeNull();

    prismaMock.apiKey.findUnique.mockResolvedValueOnce(record({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await apiKeysService.authenticate(raw)).toBeNull();
  });

  it("resolves a valid key to its org and scopes", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(record({ scopes: ["tickets:read", "tickets:write"] }));

    expect(await apiKeysService.authenticate(raw)).toEqual({
      keyId: "k1",
      orgId: "org1",
      scopes: ["tickets:read", "tickets:write"],
    });
  });

  it("accepts a key whose expiry is still in the future", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(record({ expiresAt: new Date(Date.now() + 60_000) }));
    expect(await apiKeysService.authenticate(raw)).not.toBeNull();
  });

  it("updates lastUsedAt when stale but not on every request", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValueOnce(record({ lastUsedAt: new Date(Date.now() - 10 * 60_000) }));
    await apiKeysService.authenticate(raw);
    expect(prismaMock.apiKey.update).toHaveBeenCalledTimes(1);

    prismaMock.apiKey.update.mockClear();
    prismaMock.apiKey.findUnique.mockResolvedValueOnce(record({ lastUsedAt: new Date(Date.now() - 5_000) }));
    await apiKeysService.authenticate(raw);
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled();
  });
});

describe("apiKeysService.revoke", () => {
  it("is scoped to the caller's org", async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue(null);

    await expect(apiKeysService.revoke("org1", "u1", "foreign-key")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.apiKey.findFirst).toHaveBeenCalledWith({ where: { id: "foreign-key", orgId: "org1" } });
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled();
  });

  it("revokes an active key", async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue(record());

    await apiKeysService.revoke("org1", "u1", "k1");

    expect(prismaMock.apiKey.update).toHaveBeenCalledWith({ where: { id: "k1" }, data: { revokedAt: expect.any(Date) } });
  });
});

describe("toPublicApiKey", () => {
  it("never exposes the hash", () => {
    expect(toPublicApiKey(record() as never)).not.toHaveProperty("keyHash");
  });
});
