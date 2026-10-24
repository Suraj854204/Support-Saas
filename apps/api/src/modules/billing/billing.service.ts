import { Prisma } from "@prisma/client";
import type { PlanTier } from "@support-saas/shared-types";
import type Stripe from "stripe";

import { entitlementsService } from "./entitlements.service";
import { overageService } from "./overage.service";
import { csv, GST_NOTE, overagePriceIdForPlan, planFor, planForPriceId, PLANS, priceIdForPlan, tierForStatus } from "./plans";
import { billingConfigured, getStripe } from "./stripe-client";
import { usageService } from "./usage.service";

import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const PAID_ACTIVE = new Set(["active", "trialing", "past_due"]);

/** The subscription item that carries the plan (a metered overage item may sit beside it, in any order). */
function baseItem(sub: Stripe.Subscription) {
  return sub.items.data.find((i) => planForPriceId(i.price.id));
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  // Newer Stripe API versions keep the billing period on the subscription item.
  const seconds = (baseItem(sub) ?? sub.items.data[0])?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
}

export interface InvoiceRow {
  id: string;
  number: string | null;
  createdAt: string;
  status: string | null;
  currency: string;
  total: number; // minor units (paise)
  amountPaid: number;
  tax: number;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
}

export const billingService = {
  async overview(orgId: string) {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { planTier: true } });
    if (!org) throw AppError.notFound("Organization not found");
    const plan = planFor(org.planTier);
    const [seats, articles, forms, aiReplies, subscription] = await Promise.all([
      entitlementsService.countFor(orgId, "seats"),
      entitlementsService.countFor(orgId, "articles"),
      entitlementsService.countFor(orgId, "forms"),
      usageService.used(orgId, "ai_replies"),
      prisma.subscription.findUnique({ where: { orgId } }),
    ]);

    const overage = await overageService.availability(orgId, plan.tier);
    const overageUnits = await usageService.used(orgId, "ai_overage");
    const introEligible = !subscription || subscription.status === "none";

    return {
      billingEnabled: billingConfigured(),
      gstNote: GST_NOTE,
      plan: { tier: plan.tier, name: plan.name, limits: plan.limits, priceInr: plan.priceInr },
      overage: {
        offered: overage.offered,
        available: overage.available,
        enabled: overage.enabled,
        ratePerReplyInr: plan.overageInrPerReply,
        capUnits: plan.limits.aiRepliesPerMonth,
        usedUnits: overageUnits,
        estimatedChargeInr: plan.overageInrPerReply ? Math.round(overageUnits * plan.overageInrPerReply * 100) / 100 : 0,
      },
      usage: { seats, articles, forms, aiReplies },
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            hasPaymentMethodOnFile: Boolean(subscription.stripeSubscriptionId),
          }
        : null,
      plans: (Object.keys(PLANS) as PlanTier[]).map((tier) => ({
        tier,
        name: PLANS[tier].name,
        limits: PLANS[tier].limits,
        selfServe: PLANS[tier].selfServe,
        priceInr: PLANS[tier].priceInr,
        introPriceInr: introEligible && env.STRIPE_COUPON_INTRO ? PLANS[tier].introPriceInr : null,
        overageInrPerReply: PLANS[tier].overageInrPerReply,
        // India e-mandate rule: recurring card charges over INR 15,000 need the customer's approval every cycle.
        renewalNeedsApproval: PLANS[tier].priceInr * 1.18 > 15_000,
        // Only offered when the price is actually configured, so the UI never shows a dead button.
        purchasable: PLANS[tier].selfServe && Boolean(priceIdForPlan(tier)) && billingConfigured(),
      })),
    };
  },

  /** The Stripe customer for this org: reuse the stored one, otherwise create it once. */
  async ensureCustomer(orgId: string, email: string): Promise<string> {
    const existing = await prisma.subscription.findUnique({ where: { orgId } });
    if (existing) return existing.stripeCustomerId;

    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    const customer = await getStripe().customers.create({ email, name: org?.name, metadata: { orgId } });
    try {
      await prisma.subscription.create({ data: { orgId, stripeCustomerId: customer.id } });
      return customer.id;
    } catch (err) {
      // Two admins clicked "Upgrade" at once: keep the first customer, never create duplicates.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await prisma.subscription.findUnique({ where: { orgId } });
        if (winner) return winner.stripeCustomerId;
      }
      throw err;
    }
  },

  async createCheckout(orgId: string, actor: { id: string; email: string }, tier: PlanTier) {
    const plan = PLANS[tier];
    if (!plan?.selfServe) throw AppError.validation("This plan can't be bought online. Contact us for Enterprise.");
    const price = priceIdForPlan(tier);
    if (!billingConfigured() || !price) throw AppError.billingNotConfigured();

    const current = await prisma.subscription.findUnique({ where: { orgId } });
    if (current?.stripeSubscriptionId && PAID_ACTIVE.has(current.status)) {
      // Changing plan on an existing subscription happens in the Stripe portal; a second Checkout would double-bill.
      throw AppError.conflict("You already have a subscription. Use “Manage billing” to change or cancel it.");
    }

    const customer = await this.ensureCustomer(orgId, actor.email);

    // GST: fixed Stripe Tax Rates on every line (Stripe Tax can't compute domestic Indian GST for an India-based seller).
    const taxRates = csv(env.STRIPE_TAX_RATE_IDS);
    const lineTax = taxRates.length > 0 ? { tax_rates: taxRates } : {};
    const overagePrice = overagePriceIdForPlan(tier);
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price, quantity: 1, ...lineTax }];
    // A metered price takes no quantity: it bills only what the meter reports (extra AI replies, if the org opts in).
    if (overagePrice) lineItems.push({ price: overagePrice, ...lineTax });

    // Introductory first month: only for an org that has never subscribed, and never stacked with promo codes.
    const introEligible = (!current || current.status === "none") && Boolean(plan.introPriceInr) && Boolean(env.STRIPE_COUPON_INTRO);

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: orgId,
      line_items: lineItems,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true }, // customers can add their GSTIN, which then appears on the invoice
      customer_update: { name: "auto", address: "auto" },
      subscription_data: { metadata: { orgId, plan: tier } },
      ...(introEligible ? { discounts: [{ coupon: env.STRIPE_COUPON_INTRO }] } : { allow_promotion_codes: true }),
      success_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=success`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=cancelled`,
    });
    if (!session.url) throw AppError.internal("Stripe did not return a checkout URL");

    await recordAudit({ orgId, actorId: actor.id, action: "billing.checkout_started", targetType: "organization", targetId: orgId, metadata: { plan: tier } });
    return { url: session.url };
  },

  /** The org's invoices and payment receipts. The customer id comes from our own record, never from the request. */
  async invoices(orgId: string): Promise<InvoiceRow[]> {
    if (!billingConfigured()) return [];
    const sub = await prisma.subscription.findUnique({ where: { orgId } });
    if (!sub) return [];
    const list = await getStripe().invoices.list({ customer: sub.stripeCustomerId, limit: 24 });
    return list.data
      .filter((i) => i.status !== "draft")
      .map((i) => ({
        id: i.id!,
        number: i.number,
        createdAt: new Date(i.created * 1000).toISOString(),
        status: i.status,
        currency: i.currency,
        total: i.total,
        amountPaid: i.amount_paid,
        tax: (i.total_taxes ?? []).reduce((sum, t) => sum + t.amount, 0),
        hostedInvoiceUrl: i.hosted_invoice_url ?? null,
        pdfUrl: i.invoice_pdf ?? null,
      }));
  },

  async setOverage(orgId: string, enabled: boolean) {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { planTier: true } });
    if (!org) throw AppError.notFound("Organization not found");
    if (enabled) {
      const a = await overageService.availability(orgId, org.planTier);
      if (!a.available) throw AppError.conflict("Pay-per-use AI replies need an active paid plan with usage billing set up.");
    }
    const r = await overageService.setEnabled(orgId, enabled);
    if (!r.updated) throw AppError.conflict("There is no billing account yet. Choose a plan first.");
    await recordAudit({ orgId, actorId: "billing", action: "billing.overage_toggled", targetType: "organization", targetId: orgId, metadata: { enabled } });
    return { enabled };
  },

  async createPortal(orgId: string) {
    if (!billingConfigured()) throw AppError.billingNotConfigured();
    const sub = await prisma.subscription.findUnique({ where: { orgId } });
    if (!sub) throw AppError.conflict("There is no billing account yet. Choose a plan first.");
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });
    return { url: session.url };
  },

  // -------------------------------------------------------------------------
  // Webhook
  // -------------------------------------------------------------------------

  /** Verifies the signature (needs the RAW body), then applies the event exactly once. */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ handled: boolean; duplicate?: boolean }> {
    if (!billingConfigured() || !env.STRIPE_WEBHOOK_SECRET) throw AppError.billingNotConfigured();
    if (!signature) throw AppError.validation("Missing Stripe signature");

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      // Same message for bad signature and malformed body: nothing to learn for an attacker.
      throw AppError.validation("Invalid Stripe signature");
    }
    return this.processEvent(event);
  },

  async processEvent(event: Stripe.Event): Promise<{ handled: boolean; duplicate?: boolean }> {
    // Idempotency: the first delivery inserts the row; a retry finds it. A row without processedAt means the
    // earlier attempt failed midway, so it is processed again (Stripe retried because we answered 5xx).
    try {
      await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      const seen = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
      if (seen?.processedAt) return { handled: false, duplicate: true };
    }

    let handled = true;
    switch (event.type) {
      case "checkout.session.completed":
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.applySubscription(event.data.object as Stripe.Subscription, new Date(event.created * 1000));
        break;
      case "invoice.payment_failed":
        logger.warn({ eventId: event.id }, "Stripe invoice payment failed (subscription status follows via subscription.updated)");
        break;
      default:
        handled = false;
    }

    await prisma.stripeEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
    return { handled };
  },

  /** Only links the customer to the org; the plan itself always comes from the subscription events. */
  async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const orgId = session.client_reference_id;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (!orgId || !customerId) return;
    const sub = await prisma.subscription.findUnique({ where: { orgId } });
    if (sub && sub.stripeCustomerId !== customerId) {
      logger.error({ orgId, customerId }, "Checkout completed for a different customer than the one on file; ignoring");
    }
  },

  async applySubscription(sub: Stripe.Subscription, eventAt: Date) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    // The customer id is what ties a Stripe object to an organization (set by us at checkout);
    // metadata is only a fallback and is cross-checked against it.
    const row = await prisma.subscription.findUnique({ where: { stripeCustomerId: customerId } });
    if (!row) {
      logger.error({ customerId, subscriptionId: sub.id }, "Stripe subscription for an unknown customer; ignored");
      return;
    }
    const metaOrg = sub.metadata?.orgId;
    if (metaOrg && metaOrg !== row.orgId) {
      logger.error({ customerId, metaOrg, orgId: row.orgId }, "Subscription metadata disagrees with the customer's organization; ignored");
      return;
    }
    if (row.lastEventAt && eventAt < row.lastEventAt) return; // out-of-order delivery: a newer state is already applied

    const priceId = baseItem(sub)?.price.id ?? sub.items.data[0]?.price.id;
    const paidTier = planForPriceId(priceId);
    if (!paidTier) {
      logger.error({ priceId, subscriptionId: sub.id }, "Subscription uses a price that is not configured in STRIPE_PRICE_*; plan unchanged");
      return;
    }

    const org = await prisma.organization.findUnique({ where: { id: row.orgId }, select: { planTier: true } });
    if (!org) return;
    const tier = tierForStatus(sub.status, paidTier, org.planTier as PlanTier);
    const ended = tier === "free" && !PAID_ACTIVE.has(sub.status);

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: row.id },
        data: {
          stripeSubscriptionId: ended ? null : sub.id,
          status: sub.status,
          planTier: tier,
          currentPeriodEnd: periodEnd(sub),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          lastEventAt: eventAt,
        },
      }),
      prisma.organization.update({ where: { id: row.orgId }, data: { planTier: tier } }),
    ]);

    if (tier !== org.planTier) {
      await recordAudit({
        orgId: row.orgId,
        actorId: "stripe",
        action: "billing.plan_changed",
        targetType: "organization",
        targetId: row.orgId,
        metadata: { from: org.planTier, to: tier, status: sub.status },
      });
    }
  },
};
