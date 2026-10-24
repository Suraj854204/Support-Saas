import type { AddressInfo } from "net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn().mockResolvedValue(null) }) }),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), on: vi.fn() } }));
vi.mock("@/lib/kafka", () => ({ KAFKA_TOPICS: {}, publishEvent: vi.fn(), connectProducer: vi.fn(), disconnectProducer: vi.fn() }));

import { createApp } from "@/app";

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(() => r(undefined))));

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.status);

describe("public rating endpoint", () => {
  it("rejects ratings outside 1-5 and non-integers before touching any data", async () => {
    for (const rating of [0, 6, 3.5, "5", null]) expect(await post("/api/ticket-tracking/sometoken/rating", { rating })).toBe(422);
  });
  it("answers an unknown or expired token with a generic 404", async () => {
    expect(await post("/api/ticket-tracking/nosuchtoken/rating", { rating: 5 })).toBe(404);
  });
  it("the agent summary needs a login", async () => {
    expect((await fetch(`${base}/api/csat/summary`)).status).toBe(401);
  });
});
