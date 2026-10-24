import type { AddressInfo } from "net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn().mockResolvedValue(null) }) }),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), on: vi.fn() } }));
vi.mock("@/lib/kafka", () => ({ KAFKA_TOPICS: {}, publishEvent: vi.fn(), connectProducer: vi.fn(), disconnectProducer: vi.fn() }));

import { createApp } from "@/app";
import { signAccessToken } from "@/lib/jwt";

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(() => r(undefined))));

const token = (role: "viewer" | "agent" | "admin") => signAccessToken({ sub: "u1", orgId: "org1", role, emailVerified: true } as never);
const call = (role: "viewer" | "agent" | "admin", method: string, path: string, body: unknown = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token(role)}`, "content-type": "application/json" },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body),
  }).then((r) => r.status);

const UUID = "11111111-1111-4111-8111-111111111111";
const WRITES: [string, string][] = [
  ["POST", "/api/tickets"],
  ["PATCH", "/api/tickets/bulk-update"],
  ["PATCH", `/api/tickets/${UUID}`],
  ["POST", `/api/tickets/${UUID}/messages`],
  ["POST", `/api/tickets/${UUID}/ai-suggest`],
  ["POST", `/api/tickets/${UUID}/tracking-link`],
  ["POST", "/api/customers"],
  ["PATCH", `/api/customers/${UUID}`],
  ["POST", "/api/canned-responses"],
  ["PATCH", `/api/canned-responses/${UUID}`],
  ["DELETE", `/api/canned-responses/${UUID}`],
];
const ADMIN_ONLY: [string, string][] = [
  ["POST", `/api/customers/${UUID}/merge`],
  ["GET", `/api/customers/${UUID}/export`],
  ["DELETE", `/api/customers/${UUID}`],
];

describe("read-only viewers cannot change data", () => {
  for (const [method, path] of [...WRITES, ...ADMIN_ONLY]) {
    it(`viewer ${method} ${path} is 403`, async () => {
      expect(await call("viewer", method, path)).toBe(403);
    });
  }
  it("viewers can still read", async () => {
    expect(await call("viewer", "GET", "/api/customers")).not.toBe(403);
    expect(await call("viewer", "GET", "/api/tickets")).not.toBe(403);
  });
});

describe("agents vs admin-only customer actions", () => {
  for (const [method, path] of ADMIN_ONLY) {
    it(`agent ${method} ${path} is 403, admin is let through`, async () => {
      expect(await call("agent", method, path)).toBe(403);
      expect(await call("admin", method, path)).not.toBe(403);
    });
  }
  it("agents can still do ordinary work", async () => {
    expect(await call("agent", "PATCH", `/api/tickets/${UUID}`, { status: "open" })).not.toBe(403);
    expect(await call("agent", "POST", "/api/customers", { name: "A" })).not.toBe(403);
  });
});

describe("call requests", () => {
  it("viewers can see the queue but not change it", async () => {
    expect(await call("viewer", "GET", "/api/call-requests")).not.toBe(403);
    expect(await call("viewer", "PATCH", `/api/call-requests/${UUID}`, { status: "completed" })).toBe(403);
    expect(await call("agent", "PATCH", `/api/call-requests/${UUID}`, { status: "completed" })).not.toBe(403);
  });
});
