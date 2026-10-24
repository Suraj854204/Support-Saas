import type { AddressInfo } from "net";

import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, model) => {
        if (model === "stripeEvent") return { create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), findUnique: vi.fn() };
        if (model === "subscription")
          return {
            findUnique: vi.fn().mockResolvedValue({ id: "s1", orgId: "org1", stripeCustomerId: "cus_1", lastEventAt: null }),
            update: vi.fn().mockResolvedValue({}),
          };
        if (model === "organization") return { findUnique: vi.fn().mockResolvedValue({ planTier: "free" }), update: vi.fn().mockResolvedValue({}) };
        if (model === "$transaction") return async (ops: unknown[]) => Promise.all(ops);
        return new Proxy({}, { get: () => vi.fn().mockResolvedValue(null) });
      },
    }
  ),
  planUpdates: [] as unknown[],
}));

vi.mock("@/config/env", async (orig) => {
  const real = (await orig()) as { env: Record<string, unknown> };
  return {
    ...real,
    env: {
      ...real.env,
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_http_test",
      STRIPE_PRICE_STARTER: "price_starter",
      STRIPE_PRICE_GROWTH: "price_growth",
    },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
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

const payload = JSON.stringify({
  id: "evt_http_1",
  type: "customer.subscription.updated",
  created: 1_800_000_000,
  data: {
    object: {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      metadata: { orgId: "org1" },
      items: { data: [{ price: { id: "price_growth" }, current_period_end: 1_802_000_000 }] },
    },
  },
});

describe("POST /api/billing/webhook through the real Express app", () => {
  it("accepts a correctly signed body (the raw bytes reach the verifier)", async () => {
    const sig = new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload, secret: "whsec_http_test" });
    const res = await fetch(`${base}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body: payload });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, handled: true });
  });

  it("rejects a body re-serialized after signing, and a missing signature", async () => {
    const sig = new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload, secret: "whsec_http_test" });
    const reformatted = JSON.stringify(JSON.parse(payload), null, 2); // same data, different bytes
    const r1 = await fetch(`${base}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body: reformatted });
    expect(r1.status).toBe(422);
    const r2 = await fetch(`${base}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
    expect(r2.status).toBe(422);
  });

  it("needs no login, but the authenticated billing routes do", async () => {
    expect((await fetch(`${base}/api/billing`)).status).toBe(401);
    expect((await fetch(`${base}/api/billing/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "growth" }) })).status).toBe(401);
  });
});
