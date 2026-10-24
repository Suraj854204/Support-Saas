import type { PlanTier } from "@support-saas/shared-types";

// Pure data: no env or database imports, so scripts (stripe:setup) can read it without a full app configuration.

/** null = unlimited. */
export interface PlanLimits {
  seats: number | null;
  aiRepliesPerMonth: number | null;
  articles: number | null;
  forms: number | null;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  limits: PlanLimits;
  /** Can be bought through Stripe Checkout. */
  selfServe: boolean;
  /** Monthly price in rupees, EXCLUDING GST. */
  priceInr: number;
  /** One-time price of the first month (rupees, excluding GST), when an introductory offer exists. */
  introPriceInr: number | null;
  /** Rupees per AI reply above the monthly allowance (excluding GST); null = overage not offered. */
  overageInrPerReply: number | null;
}

/**
 * The single place plans, limits and prices are defined. `npm run stripe:setup` creates the matching
 * Stripe products and prices from this table, so the two cannot drift apart.
 * The `enterprise` tier key is shown to customers as "Scale"; the key is kept so existing data stays valid.
 */
export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: { tier: "free", name: "Free", selfServe: false, priceInr: 0, introPriceInr: null, overageInrPerReply: null, limits: { seats: 2, aiRepliesPerMonth: 50, articles: 20, forms: 1 } },
  starter: { tier: "starter", name: "Starter", selfServe: true, priceInr: 99, introPriceInr: 9, overageInrPerReply: 1, limits: { seats: 5, aiRepliesPerMonth: 1_000, articles: 100, forms: 5 } },
  growth: { tier: "growth", name: "Growth", selfServe: true, priceInr: 999, introPriceInr: null, overageInrPerReply: 0.6, limits: { seats: 20, aiRepliesPerMonth: 10_000, articles: 1_000, forms: 25 } },
  enterprise: { tier: "enterprise", name: "Scale", selfServe: true, priceInr: 19_999, introPriceInr: null, overageInrPerReply: 0.4, limits: { seats: 100, aiRepliesPerMonth: 100_000, articles: 10_000, forms: 200 } },
};

export const toPaise = (rupees: number) => Math.round(rupees * 100);
