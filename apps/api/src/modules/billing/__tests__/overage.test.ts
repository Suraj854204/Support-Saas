import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    usageCounter: { findMany: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  },
  consume: vi.fn(),
  meter: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: { STRIPE_METER_EVENT_NAME: "ai_reply_overage", STRIPE_PRICE_OVERAGE_STARTER: "price_o_s", STRIPE_PRICE_OVERAGE_GROWTH: "price_o_g" },
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("../stripe-client", () => ({
  billingConfigured: () => true,
  getStripe: () => ({ billing: { meterEvents: { create: m.meter } } }),
}));
vi.mock("../usage.service", async (orig) => ({
  ...(await orig<typeof import("../usage.service")>()),
  usageService: { consume: m.consume },
}));

import { overageService } from "../overage.service";

const activeSub = { overageEnabled: true, status: "active", stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1" };

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.subscription.findUnique.mockResolvedValue(activeSub);
  m.prisma.usageCounter.findMany.mockResolvedValue([]);
  m.meter.mockResolvedValue({});
});

describe("overage availability and consumption", () => {
  it("is never available on the free plan", async () => {
    expect((await overageService.availability("o", "free")).available).toBe(false);
    expect(await overageService.tryConsume("o", "free")).toBe(false);
    expect(m.consume).not.toHaveBeenCalled();
  });
  it("needs an active subscription and an explicit opt-in", async () => {
    m.prisma.subscription.findUnique.mockResolvedValue({ ...activeSub, status: "past_due" });
    expect(await overageService.tryConsume("o", "starter")).toBe(false);
    m.prisma.subscription.findUnique.mockResolvedValue({ ...activeSub, overageEnabled: false });
    expect(await overageService.tryConsume("o", "starter")).toBe(false);
    expect(m.consume).not.toHaveBeenCalled();
  });
  it("is capped at one extra allowance per month", async () => {
    m.consume.mockResolvedValue({ allowed: false });
    expect(await overageService.tryConsume("o", "starter")).toBe(false);
    expect(m.consume).toHaveBeenCalledWith("o", "ai_overage", 1000);
  });
  it("an allowed unit is counted and reported to Stripe", async () => {
    m.consume.mockResolvedValue({ allowed: true });
    m.prisma.usageCounter.findMany.mockResolvedValue([{ metric: "ai_overage", count: 1 }]);
    expect(await overageService.tryConsume("o", "starter")).toBe(true);
    await vi.waitFor(() => expect(m.meter).toHaveBeenCalledTimes(1));
    expect(m.meter.mock.calls[0]![0]).toMatchObject({
      event_name: "ai_reply_overage",
      payload: { stripe_customer_id: "cus_1", value: "1" },
    });
  });
});

describe("overage flush", () => {
  it("sends each unreported unit once with a deterministic identifier", async () => {
    m.prisma.usageCounter.findMany.mockResolvedValue([
      { metric: "ai_overage", count: 5 },
      { metric: "ai_overage_reported", count: 3 },
    ]);
    expect(await overageService.flush("o", "2026-10")).toBe(2);
    expect(m.meter.mock.calls.map((c) => c[0].identifier)).toEqual(["ovg:o:2026-10:4", "ovg:o:2026-10:5"]);
    expect(m.prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it("does nothing when everything is already reported", async () => {
    m.prisma.usageCounter.findMany.mockResolvedValue([
      { metric: "ai_overage", count: 3 },
      { metric: "ai_overage_reported", count: 3 },
    ]);
    expect(await overageService.flush("o", "2026-10")).toBe(0);
    expect(m.meter).not.toHaveBeenCalled();
  });
  it("a Stripe failure stops the batch and only the sent units are marked reported", async () => {
    m.prisma.usageCounter.findMany.mockResolvedValue([{ metric: "ai_overage", count: 4 }]);
    m.meter.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("rate limited"));
    expect(await overageService.flush("o", "2026-10")).toBe(1);
    expect(m.meter).toHaveBeenCalledTimes(2);
  });
  it("sends nothing when the org has no billing account", async () => {
    m.prisma.subscription.findUnique.mockResolvedValue(null);
    expect(await overageService.flush("o", "2026-10")).toBe(0);
  });
  it("the sweep flushes every org that has unreported units", async () => {
    m.prisma.$queryRaw.mockResolvedValue([{ org_id: "a", period: "2026-10" }, { org_id: "b", period: "2026-09" }]);
    m.prisma.usageCounter.findMany.mockResolvedValue([{ metric: "ai_overage", count: 1 }]);
    expect(await overageService.flushPending(new Date("2026-10-23"))).toBe(2);
  });
});
