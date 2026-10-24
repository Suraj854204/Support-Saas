/**
 * Creates the Stripe objects this app expects (products, INR prices, usage meter, GST tax rate, intro coupon)
 * from the single plan table in src/modules/billing/plans.data.ts, then prints the env lines to paste.
 *
 *   STRIPE_SECRET_KEY=sk_test_... GST_PERCENT=18 npm run stripe:setup -w apps/api
 *
 * Safe to re-run: every object carries lookup metadata/keys and is reused when it already exists.
 * It only ever creates objects; it never deletes or edits anything. Use a TEST key first.
 */
import Stripe from "stripe";

import { PLANS, toPaise } from "../src/modules/billing/plans.data";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_") && !key.startsWith("rk_")) {
  console.error("Set STRIPE_SECRET_KEY (sk_test_... first).");
  process.exit(1);
}
const gstPercent = Number(process.env.GST_PERCENT ?? "18");
const stripe = new Stripe(key);
const live = key.startsWith("sk_live") || key.startsWith("rk_live");
const METER_EVENT = process.env.STRIPE_METER_EVENT_NAME ?? "ai_reply_overage";

const out: Record<string, string> = {};

async function product(tier: string, name: string) {
  const found = await stripe.products.search({ query: `metadata['app_plan']:'${tier}' AND active:'true'`, limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.products.create({ name: `Support Desk — ${name}`, metadata: { app_plan: tier } });
}

async function recurringPrice(productId: string, tier: string, kind: "base" | "overage", params: Omit<Stripe.PriceCreateParams, "product" | "currency" | "metadata">) {
  const found = await stripe.prices.search({ query: `metadata['app_price']:'${tier}:${kind}' AND active:'true'`, limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({ ...params, product: productId, currency: "inr", metadata: { app_price: `${tier}:${kind}` } });
}

async function main() {
  console.log(live ? "LIVE mode" : "TEST mode");

  // 1. Billing meter for pay-per-use AI replies.
  const meters = await stripe.billing.meters.list({ limit: 100, status: "active" });
  let meter = meters.data.find((m) => m.event_name === METER_EVENT);
  if (!meter) {
    meter = await stripe.billing.meters.create({
      display_name: "Extra AI replies",
      event_name: METER_EVENT,
      default_aggregation: { formula: "sum" },
      customer_mapping: { event_payload_key: "stripe_customer_id", type: "by_id" },
      value_settings: { event_payload_key: "value" },
    });
  }

  // 2. Products and prices.
  for (const plan of Object.values(PLANS)) {
    if (!plan.selfServe) continue;
    const prod = await product(plan.tier, plan.name);
    const base = await recurringPrice(prod.id, plan.tier, "base", {
      unit_amount: toPaise(plan.priceInr),
      recurring: { interval: "month" },
      tax_behavior: "exclusive",
      nickname: `${plan.name} monthly`,
    });
    out[`STRIPE_PRICE_${plan.tier.toUpperCase()}`] = base.id;
    if (plan.overageInrPerReply) {
      const over = await recurringPrice(prod.id, plan.tier, "overage", {
        unit_amount: toPaise(plan.overageInrPerReply),
        recurring: { interval: "month", usage_type: "metered", meter: meter.id },
        tax_behavior: "exclusive",
        nickname: `${plan.name} extra AI replies`,
      });
      out[`STRIPE_PRICE_OVERAGE_${plan.tier.toUpperCase()}`] = over.id;
    }
  }

  // 3. Intro coupon: first Starter month costs introPriceInr.
  const starter = PLANS.starter;
  if (starter.introPriceInr !== null) {
    const id = "intro_first_month_starter";
    try {
      const c = await stripe.coupons.retrieve(id);
      out.STRIPE_COUPON_INTRO = c.id;
    } catch {
      const c = await stripe.coupons.create({
        id,
        name: `First month ₹${starter.introPriceInr}`,
        amount_off: toPaise(starter.priceInr - starter.introPriceInr),
        currency: "inr",
        duration: "once",
        applies_to: { products: [(await product("starter", starter.name)).id] },
      });
      out.STRIPE_COUPON_INTRO = c.id;
    }
  }

  // 4. GST tax rate (exclusive). Rate comes from GST_PERCENT; confirm it with your CA.
  const rates = await stripe.taxRates.list({ active: true, limit: 100 });
  let rate = rates.data.find((r) => r.metadata?.app === "gst" && r.percentage === gstPercent && !r.inclusive);
  if (!rate) {
    rate = await stripe.taxRates.create({
      display_name: "GST",
      description: `GST ${gstPercent}%`,
      percentage: gstPercent,
      inclusive: false,
      country: "IN",
      tax_type: "gst",
      metadata: { app: "gst" },
    });
  }
  out.STRIPE_TAX_RATE_IDS = rate.id;
  out.STRIPE_METER_EVENT_NAME = METER_EVENT;

  console.log("\nPaste these into your environment (never commit real keys):\n");
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
  console.log(`
Still to do in the Stripe Dashboard (cannot be done through the API safely):
  - Settings > Business > set your legal name, address and GSTIN on the account, and add the GSTIN under
    Settings > Billing > Invoice > "Default account tax IDs" so every invoice shows it.
  - Settings > Billing > Customer portal: enable invoice history and payment method updates.
  - Developers > Webhooks: endpoint https://<api>/api/billing/webhook with the events listed in .env.example.`);
}

main().catch((err) => {
  console.error("stripe:setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
