import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "whsec_test_secret_for_unit_tests";

const m = vi.hoisted(() => ({
  prisma: {
    organization: { findUnique: vi.fn(), update: vi.fn() },
    subscription: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    stripeEvent: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { count: vi.fn() },
    invitation: { count: vi.fn() },
    knowledgeArticle: { count: vi.fn() },
    intakeForm: { count: vi.fn() },
    usageCounter: { findUnique: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    $queryRaw: vi.fn(),
  },
  stripe: {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
  },
  audit: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_test_secret_for_unit_tests",
    STRIPE_PRICE_STARTER: "price_starter",
    STRIPE_PRICE_GROWTH: "price_growth",
    STRIPE_PRICE_OVERAGE_GROWTH: "price_growth_overage",
    STRIPE_TAX_RATE_IDS: "txr_gst18",
    STRIPE_COUPON_INTRO: "coupon_intro",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.audit }));
vi.mock("../stripe-client", () => {
  // A real Stripe object is used for signature verification; only the network calls are replaced.
  const real = new Stripe("sk_test_x");
  return {
    billingConfigured: () => true,
    getStripe: () => Object.assign(real, { customers: m.stripe.customers, checkout: m.stripe.checkout, billingPortal: m.stripe.billingPortal }),
  };
});

import { billingService } from "../billing.service";
import { entitlementsService } from "../entitlements.service";
import { PLANS, planFor, planForPriceId, tierForStatus } from "../plans";
import { currentPeriod, usageService } from "../usage.service";

const dupError = () => new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });

function signedEvent(event: object) {
  const payload = JSON.stringify(event);
  const header = new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { body: Buffer.from(payload), header };
}

const subEvent = (over: Record<string, unknown> = {}, id = "evt_1", created = 1_800_000_000) => ({
  id,
  type: "customer.subscription.updated",
  created,
  data: {
    object: {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      metadata: { orgId: "org1" },
      items: { data: [{ price: { id: "price_growth" }, current_period_end: 1_802_000_000 }] },
      ...over,
    },
  },
});

describe("plans", () => {
  it("free is the fallback for unknown tiers", () => {
    expect(planFor("nonsense").tier).toBe("free");
    expect(planFor(undefined).tier).toBe("free");
  });
  it("INR prices are 99 / 999 / 19,999 with a Rs 9 intro for Starter, and overage gets cheaper as plans grow", () => {
    expect([PLANS.free.priceInr, PLANS.starter.priceInr, PLANS.growth.priceInr, PLANS.enterprise.priceInr]).toEqual([0, 99, 999, 19999]);
    expect(PLANS.starter.introPriceInr).toBe(9);
    expect(PLANS.starter.overageInrPerReply!).toBeGreaterThan(PLANS.growth.overageInrPerReply!);
    expect(PLANS.growth.overageInrPerReply!).toBeGreaterThan(PLANS.enterprise.overageInrPerReply!);
    expect(PLANS.free.overageInrPerReply ?? null).toBeNull();
  });
  it("limits grow with the tier and every plan has finite limits", () => {
    expect(PLANS.starter.limits.seats!).toBeGreaterThan(PLANS.free.limits.seats!);
    expect(PLANS.growth.limits.aiRepliesPerMonth!).toBeGreaterThan(PLANS.starter.limits.aiRepliesPerMonth!);
    expect(PLANS.enterprise.limits.aiRepliesPerMonth!).toBeGreaterThan(PLANS.growth.limits.aiRepliesPerMonth!);
    expect(PLANS.enterprise.selfServe).toBe(true);
  });
  it("maps configured price ids and rejects unknown ones", () => {
    expect(planForPriceId("price_starter")).toBe("starter");
    expect(planForPriceId("price_growth")).toBe("growth");
    expect(planForPriceId("price_other")).toBeNull();
    expect(planForPriceId(undefined)).toBeNull();
  });
  it.each([
    ["active", "growth", "free", "growth"],
    ["trialing", "growth", "free", "growth"],
    ["past_due", "growth", "growth", "growth"], // grace while Stripe retries the payment
    ["canceled", "growth", "growth", "free"],
    ["unpaid", "growth", "growth", "free"],
    ["incomplete", "growth", "free", "free"], // never grant on an unconfirmed payment
    ["incomplete", "growth", "starter", "starter"], // never take away on a guess either
  ])("status %s (price %s, currently %s) -> %s", (status, paid, current, expected) => {
    expect(tierForStatus(status, paid as "growth", current as "free")).toBe(expected);
  });
});

describe("usageService.consume", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows while under the limit", async () => {
    m.prisma.$queryRaw.mockResolvedValue([{ count: 3 }]);
    expect(await usageService.consume("o", "ai_replies", 10)).toEqual({ allowed: true, used: 3 });
  });
  it("refuses when the atomic statement updates no row (limit reached)", async () => {
    m.prisma.$queryRaw.mockResolvedValue([]);
    m.prisma.usageCounter.findUnique.mockResolvedValue({ count: 10 });
    expect(await usageService.consume("o", "ai_replies", 10)).toEqual({ allowed: false, used: 10 });
  });
  it("a zero limit refuses without touching the counter", async () => {
    m.prisma.usageCounter.findUnique.mockResolvedValue(null);
    expect((await usageService.consume("o", "ai_replies", 0)).allowed).toBe(false);
    expect(m.prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it("unlimited plans are always allowed", async () => {
    m.prisma.$queryRaw.mockResolvedValue([{ count: 99999 }]);
    expect((await usageService.consume("o", "ai_replies", null)).allowed).toBe(true);
  });
  it("periods are calendar months in UTC", () => {
    expect(currentPeriod(new Date("2026-01-31T23:59:59Z"))).toBe("2026-01");
    expect(currentPeriod(new Date("2026-02-01T00:00:00Z"))).toBe("2026-02");
  });
});

describe("entitlementsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.organization.findUnique.mockResolvedValue({ planTier: "free" });
    m.prisma.user.count.mockResolvedValue(1);
    m.prisma.invitation.count.mockResolvedValue(0);
  });

  it("allows adding a seat under the limit", async () => {
    await expect(entitlementsService.assertCanAdd("o", "seats")).resolves.toBeUndefined();
  });
  it("counts pending invitations as seats and answers 402 with details for the UI", async () => {
    m.prisma.invitation.count.mockResolvedValue(1); // 1 member + 1 pending = 2 = free limit
    await expect(entitlementsService.assertCanAdd("o", "seats")).rejects.toMatchObject({
      statusCode: 402,
      code: "PLAN_LIMIT_REACHED",
      details: { metric: "seats", limit: 2, plan: "free" },
    });
  });
  it("accepting an invitation does not count the invitee's own pending invite", async () => {
    m.prisma.invitation.count.mockResolvedValue(5);
    await expect(entitlementsService.assertCanAdd("o", "seats", { includePendingInvites: false })).resolves.toBeUndefined();
  });
  it("articles and forms are limited per plan", async () => {
    m.prisma.knowledgeArticle.count.mockResolvedValue(20);
    await expect(entitlementsService.assertCanAdd("o", "articles")).rejects.toMatchObject({ statusCode: 402 });
    m.prisma.intakeForm.count.mockResolvedValue(1);
    await expect(entitlementsService.assertCanAdd("o", "forms")).rejects.toMatchObject({ statusCode: 402 });
  });
  it("the top plan (Scale) has high but finite limits", async () => {
    m.prisma.organization.findUnique.mockResolvedValue({ planTier: "enterprise" });
    m.prisma.knowledgeArticle.count.mockResolvedValue(5_000);
    await expect(entitlementsService.assertCanAdd("o", "articles")).resolves.toBeUndefined();
    m.prisma.knowledgeArticle.count.mockResolvedValue(10_000);
    await expect(entitlementsService.assertCanAdd("o", "articles")).rejects.toMatchObject({ statusCode: 402, details: { limit: 10000 } });
  });
  it("limits are read for the caller's own organization only", async () => {
    await entitlementsService.assertCanAdd("orgX", "seats");
    expect(m.prisma.organization.findUnique.mock.calls[0]![0].where).toEqual({ id: "orgX" });
    expect(m.prisma.user.count.mock.calls[0]![0].where).toMatchObject({ orgId: "orgX" });
  });
  it("assertAiReply throws 402 once the allowance is gone", async () => {
    m.prisma.$queryRaw.mockResolvedValue([]);
    m.prisma.usageCounter.findUnique.mockResolvedValue({ count: 50 });
    await expect(entitlementsService.assertAiReply("o")).rejects.toMatchObject({ statusCode: 402 });
  });
});

describe("billingService checkout and portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.organization.findUnique.mockResolvedValue({ name: "Acme", planTier: "free" });
    m.stripe.customers.create.mockResolvedValue({ id: "cus_new" });
    m.stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
  });

  it("creates one customer, then a subscription Checkout tied to the org", async () => {
    m.prisma.subscription.findUnique.mockResolvedValue(null);
    m.prisma.subscription.create.mockResolvedValue({});
    const r = await billingService.createCheckout("org1", { id: "u1", email: "a@b.c" }, "growth");
    expect(r.url).toContain("checkout.stripe.test");
    expect(m.stripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: { orgId: "org1" } }));
    const args = m.stripe.checkout.sessions.create.mock.calls[0]![0];
    expect(args).toMatchObject({ mode: "subscription", customer: "cus_new", client_reference_id: "org1", line_items: [
        { price: "price_growth", quantity: 1, tax_rates: ["txr_gst18"] },
        { price: "price_growth_overage", tax_rates: ["txr_gst18"] },
      ],
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
    });
    // Growth has no intro price; promo codes stay allowed instead of the intro coupon.
    expect(args.allow_promotion_codes).toBe(true);
    expect(args.discounts).toBeUndefined();
    expect(args.subscription_data.metadata.orgId).toBe("org1");
  });
  it("Starter's first month uses the intro coupon only for a never-subscribed org", async () => {
    m.prisma.subscription.findUnique.mockResolvedValue({ stripeCustomerId: "cus_1", stripeSubscriptionId: null, status: "none" });
    await billingService.createCheckout("org1", { id: "u1", email: "a@b.c" }, "starter");
    expect(m.stripe.checkout.sessions.create.mock.calls[0]![0].discounts).toEqual([{ coupon: "coupon_intro" }]);
    m.stripe.checkout.sessions.create.mockClear();
    m.prisma.subscription.findUnique.mockResolvedValue({ stripeCustomerId: "cus_1", stripeSubscriptionId: null, status: "canceled" });
    await billingService.createCheckout("org1", { id: "u1", email: "a@b.c" }, "starter");
    expect(m.stripe.checkout.sessions.create.mock.calls[0]![0].discounts).toBeUndefined();
  });
  it("refuses a second Checkout while a subscription is active (no double billing)", async () => {
    m.prisma.subscription.findUnique.mockResolvedValue({ stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", status: "active" });
    await expect(billingService.createCheckout("org1", { id: "u", email: "e" }, "growth")).rejects.toMatchObject({ statusCode: 409 });
    expect(m.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("two simultaneous upgrades keep one Stripe customer", async () => {
    m.prisma.subscription.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ stripeCustomerId: "cus_winner" });
    m.prisma.subscription.create.mockRejectedValue(dupError());
    expect(await billingService.ensureCustomer("org1", "e")).toBe("cus_winner");
  });
  it("the free plan cannot be bought online", async () => {
    await expect(billingService.createCheckout("o", { id: "u", email: "e" }, "free")).rejects.toMatchObject({ statusCode: 422 });
  });
  it("the portal needs an existing billing account", async () => {
    m.prisma.subscription.findUnique.mockResolvedValue(null);
    await expect(billingService.createPortal("org1")).rejects.toMatchObject({ statusCode: 409 });
    m.prisma.subscription.findUnique.mockResolvedValue({ stripeCustomerId: "cus_1" });
    m.stripe.billingPortal.sessions.create.mockResolvedValue({ url: "https://portal.test" });
    expect((await billingService.createPortal("org1")).url).toBe("https://portal.test");
    expect(m.stripe.billingPortal.sessions.create.mock.calls[0]![0].customer).toBe("cus_1");
  });
});

describe("billingService webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.stripeEvent.create.mockResolvedValue({});
    m.prisma.stripeEvent.update.mockResolvedValue({});
    m.prisma.subscription.findUnique.mockResolvedValue({ id: "s1", orgId: "org1", stripeCustomerId: "cus_1", lastEventAt: null });
    m.prisma.subscription.update.mockResolvedValue({});
    m.prisma.organization.findUnique.mockResolvedValue({ planTier: "free" });
    m.prisma.organization.update.mockResolvedValue({});
  });

  it("rejects a missing or forged signature and applies nothing", async () => {
    const { body } = signedEvent(subEvent());
    await expect(billingService.handleWebhook(body, undefined)).rejects.toMatchObject({ statusCode: 422 });
    await expect(billingService.handleWebhook(body, "t=1,v1=deadbeef")).rejects.toMatchObject({ statusCode: 422 });
    const tampered = Buffer.from(body.toString().replace("price_growth", "price_starter"));
    const { header } = signedEvent(subEvent());
    await expect(billingService.handleWebhook(tampered, header)).rejects.toMatchObject({ statusCode: 422 });
    expect(m.prisma.organization.update).not.toHaveBeenCalled();
    expect(m.prisma.stripeEvent.create).not.toHaveBeenCalled();
  });

  it("a correctly signed subscription upgrades the org to the mapped tier and audits it", async () => {
    const { body, header } = signedEvent(subEvent());
    const r = await billingService.handleWebhook(body, header);
    expect(r.handled).toBe(true);
    expect(m.prisma.organization.update).toHaveBeenCalledWith({ where: { id: "org1" }, data: { planTier: "growth" } });
    expect(m.prisma.subscription.update.mock.calls[0]![0].data).toMatchObject({ status: "active", planTier: "growth", stripeSubscriptionId: "sub_1" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.plan_changed", metadata: expect.objectContaining({ from: "free", to: "growth" }) }));
    expect(m.prisma.stripeEvent.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt_1" } }));
  });

  it("a redelivered event is acknowledged and not applied twice", async () => {
    m.prisma.stripeEvent.create.mockRejectedValue(dupError());
    m.prisma.stripeEvent.findUnique.mockResolvedValue({ id: "evt_1", processedAt: new Date() });
    const { body, header } = signedEvent(subEvent());
    expect(await billingService.handleWebhook(body, header)).toEqual({ handled: false, duplicate: true });
    expect(m.prisma.organization.update).not.toHaveBeenCalled();
  });

  it("an event that failed midway last time is processed on retry", async () => {
    m.prisma.stripeEvent.create.mockRejectedValue(dupError());
    m.prisma.stripeEvent.findUnique.mockResolvedValue({ id: "evt_1", processedAt: null });
    const { body, header } = signedEvent(subEvent());
    expect((await billingService.handleWebhook(body, header)).handled).toBe(true);
    expect(m.prisma.organization.update).toHaveBeenCalledTimes(1);
  });

  it("cancellation downgrades to free and clears the subscription id", async () => {
    m.prisma.organization.findUnique.mockResolvedValue({ planTier: "growth" });
    const { body, header } = signedEvent({ ...subEvent({ status: "canceled" }), type: "customer.subscription.deleted" });
    await billingService.handleWebhook(body, header);
    expect(m.prisma.organization.update).toHaveBeenCalledWith({ where: { id: "org1" }, data: { planTier: "free" } });
    expect(m.prisma.subscription.update.mock.calls[0]![0].data).toMatchObject({ stripeSubscriptionId: null, planTier: "free" });
  });

  it("past_due keeps the paid plan while Stripe retries", async () => {
    m.prisma.organization.findUnique.mockResolvedValue({ planTier: "growth" });
    const { body, header } = signedEvent(subEvent({ status: "past_due" }));
    await billingService.handleWebhook(body, header);
    expect(m.prisma.organization.update).toHaveBeenCalledWith({ where: { id: "org1" }, data: { planTier: "growth" } });
  });

  it("an older event delivered late does not overwrite newer state", async () => {
    m.prisma.subscription.findUnique.mockResolvedValue({ id: "s1", orgId: "org1", stripeCustomerId: "cus_1", lastEventAt: new Date(1_900_000_000 * 1000) });
    const { body, header } = signedEvent(subEvent({}, "evt_old", 1_800_000_000));
    await billingService.handleWebhook(body, header);
    expect(m.prisma.organization.update).not.toHaveBeenCalled();
  });

  it("a subscription for an unknown customer, or metadata pointing at another org, is ignored", async () => {
    m.prisma.subscription.findUnique.mockResolvedValueOnce(null);
    let e = signedEvent(subEvent({}, "evt_a"));
    await billingService.handleWebhook(e.body, e.header);
    expect(m.prisma.organization.update).not.toHaveBeenCalled();

    e = signedEvent(subEvent({ metadata: { orgId: "someone-else" } }, "evt_b"));
    await billingService.handleWebhook(e.body, e.header);
    expect(m.prisma.organization.update).not.toHaveBeenCalled();
  });

  it("a price that is not configured never changes the plan", async () => {
    const e = signedEvent(subEvent({ items: { data: [{ price: { id: "price_mystery" }, current_period_end: 1 }] } }, "evt_c"));
    await billingService.handleWebhook(e.body, e.header);
    expect(m.prisma.organization.update).not.toHaveBeenCalled();
  });

  it("unrelated event types are acknowledged without effect", async () => {
    const e = signedEvent({ id: "evt_z", type: "customer.created", created: 1, data: { object: {} } });
    expect((await billingService.handleWebhook(e.body, e.header)).handled).toBe(false);
  });
});
