import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticate = vi.hoisted(() => vi.fn());
vi.mock("@/modules/api-keys/api-keys.service", () => ({ apiKeysService: { authenticate } }));

import { extractApiKey, requireApiKey } from "@/middleware/api-key.middleware";

function makeReq(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

beforeEach(() => vi.clearAllMocks());

describe("extractApiKey", () => {
  it("reads X-API-Key", () => {
    expect(extractApiKey(makeReq({ "x-api-key": "ssk_abc" }))).toBe("ssk_abc");
  });

  it("reads a Bearer token", () => {
    expect(extractApiKey(makeReq({ authorization: "Bearer ssk_abc" }))).toBe("ssk_abc");
  });

  it("prefers X-API-Key when both are present", () => {
    expect(extractApiKey(makeReq({ "x-api-key": "ssk_header", authorization: "Bearer ssk_bearer" }))).toBe("ssk_header");
  });

  it("returns null when nothing usable is sent", () => {
    expect(extractApiKey(makeReq({}))).toBeNull();
    expect(extractApiKey(makeReq({ authorization: "Basic abc" }))).toBeNull();
  });
});

describe("requireApiKey", () => {
  async function run(headers: Record<string, string>, scope: "tickets:read" | "tickets:write") {
    const req = makeReq(headers);
    const next = vi.fn();
    await requireApiKey(scope)(req, {} as Response, next);
    return { req, next };
  }

  it("401s when no key is presented", async () => {
    const { next } = await run({}, "tickets:read");
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("401s for an invalid, revoked or expired key", async () => {
    authenticate.mockResolvedValue(null);
    const { next } = await run({ "x-api-key": "ssk_bad" }, "tickets:read");
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("403s when the key lacks the required scope", async () => {
    authenticate.mockResolvedValue({ keyId: "k1", orgId: "org1", scopes: ["tickets:read"] });
    const { next, req } = await run({ "x-api-key": "ssk_ok" }, "tickets:write");
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(req.apiKey).toBeUndefined();
  });

  it("attaches the org context and continues for a valid, in-scope key", async () => {
    authenticate.mockResolvedValue({ keyId: "k1", orgId: "org1", scopes: ["tickets:write"] });
    const { next, req } = await run({ authorization: "Bearer ssk_ok" }, "tickets:write");
    expect(next).toHaveBeenCalledWith();
    expect(req.apiKey).toEqual({ keyId: "k1", orgId: "org1", scopes: ["tickets:write"] });
  });

  it("forwards unexpected errors instead of hanging the request", async () => {
    authenticate.mockRejectedValue(new Error("db down"));
    const { next } = await run({ "x-api-key": "ssk_ok" }, "tickets:read");
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
