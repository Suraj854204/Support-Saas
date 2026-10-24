import type { PlanTier } from "@support-saas/shared-types";

import { PLANS, type PlanDefinition } from "./plans.data";

import { env } from "@/config/env";

export { PLANS } from "./plans.data";
export type { PlanLimits } from "./plans.data";
export type { PlanDefinition };

export const PLAN_TIERS = Object.keys(PLANS) as PlanTier[];

/** GST rate shown to customers as a note. The real rate on invoices comes from STRIPE_TAX_RATE_IDS. */
export const GST_NOTE = "All prices exclude GST. GST is added at checkout.";

export function planFor(tier: string | null | undefined): PlanDefinition {
  return PLANS[(tier as PlanTier) in PLANS ? (tier as PlanTier) : "free"];
}

export { toPaise } from "./plans.data";

/** Stripe price id for a self-serve plan, or null when it is not configured. */
export function priceIdForPlan(tier: PlanTier): string | null {
  if (tier === "starter") return env.STRIPE_PRICE_STARTER || null;
  if (tier === "growth") return env.STRIPE_PRICE_GROWTH || null;
  if (tier === "enterprise") return env.STRIPE_PRICE_ENTERPRISE || null;
  return null;
}

export function overagePriceIdForPlan(tier: PlanTier): string | null {
  if (tier === "starter") return env.STRIPE_PRICE_OVERAGE_STARTER || null;
  if (tier === "growth") return env.STRIPE_PRICE_OVERAGE_GROWTH || null;
  if (tier === "enterprise") return env.STRIPE_PRICE_OVERAGE_ENTERPRISE || null;
  return null;
}

export function planForPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === env.STRIPE_PRICE_GROWTH) return "growth";
  if (priceId === env.STRIPE_PRICE_ENTERPRISE) return "enterprise";
  return null;
}

export const csv = (value?: string): string[] => (value ?? "").split(",").map((v) => v.trim()).filter(Boolean);

/** Paid access is kept while a payment is being retried (past_due) and ends when Stripe gives up. */
export function tierForStatus(status: string, paidTier: PlanTier, current: PlanTier): PlanTier {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return paidTier;
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "free";
    default:
      // incomplete / paused / unknown: never grant a paid tier on an unconfirmed payment, never take one away on a guess.
      return current;
  }
}
