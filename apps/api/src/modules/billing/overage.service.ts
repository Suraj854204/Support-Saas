import { overagePriceIdForPlan, planFor } from "./plans";
import { billingConfigured, getStripe } from "./stripe-client";
import { currentPeriod, usageService } from "./usage.service";

import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/** Statuses in which extra usage may be billed. past_due is excluded: no more credit while a payment is failing. */
const BILLABLE = new Set(["active", "trialing"]);
const MAX_EVENTS_PER_FLUSH = 200;

const identifier = (orgId: string, period: string, unit: number) => `ovg:${orgId}:${period}:${unit}`;

/**
 * Pay-per-use AI replies after the monthly allowance, billed through a Stripe Billing Meter.
 *
 * Each extra reply is one counted unit (atomic, capped) and one meter event whose `identifier` is derived from
 * (org, month, unit number). A retry, a double flush or a crash therefore can never bill a unit twice, and a unit
 * that failed to send is simply sent again by the next flush.
 */
export const overageService = {
  /** Why overage is (not) available for this org right now. Used by the billing page. */
  async availability(orgId: string, planTier: string) {
    const plan = planFor(planTier);
    const sub = await prisma.subscription.findUnique({ where: { orgId }, select: { overageEnabled: true, status: true, stripeSubscriptionId: true } });
    const offered = Boolean(plan.overageInrPerReply) && plan.limits.aiRepliesPerMonth !== null && Boolean(overagePriceIdForPlan(plan.tier)) && billingConfigured();
    const subscribed = Boolean(sub?.stripeSubscriptionId) && BILLABLE.has(sub?.status ?? "");
    return { offered, subscribed, enabled: Boolean(sub?.overageEnabled), available: offered && subscribed };
  },

  /**
   * The allowance is used up. Returns true when this one reply may still go ahead (and will be billed).
   * Capped at one extra allowance per month (e.g. Starter: up to 1,000 extra replies) so a loop or an attack
   * can never run up an unbounded bill.
   */
  async tryConsume(orgId: string, planTier: string): Promise<boolean> {
    const plan = planFor(planTier);
    const cap = plan.limits.aiRepliesPerMonth;
    if (cap === null) return false;
    const a = await this.availability(orgId, plan.tier);
    if (!a.available || !a.enabled) return false;

    const { allowed } = await usageService.consume(orgId, "ai_overage", cap);
    if (!allowed) return false;
    void this.flush(orgId).catch((err) => logger.warn({ err, orgId }, "Overage flush failed; the next sweep retries"));
    return true;
  },

  /** Sends every counted-but-unreported unit of `period` to Stripe, oldest first. Safe to run concurrently. */
  async flush(orgId: string, period = currentPeriod()): Promise<number> {
    if (!billingConfigured()) return 0;
    const sub = await prisma.subscription.findUnique({ where: { orgId }, select: { stripeCustomerId: true } });
    if (!sub) return 0;

    const [rows] = await Promise.all([
      prisma.usageCounter.findMany({ where: { orgId, period, metric: { in: ["ai_overage", "ai_overage_reported"] } }, select: { metric: true, count: true } }),
    ]);
    const counted = rows.find((r) => r.metric === "ai_overage")?.count ?? 0;
    const reported = rows.find((r) => r.metric === "ai_overage_reported")?.count ?? 0;
    if (counted <= reported) return 0;

    const stripe = getStripe();
    let sent = reported;
    for (let unit = reported + 1; unit <= Math.min(counted, reported + MAX_EVENTS_PER_FLUSH); unit++) {
      try {
        await stripe.billing.meterEvents.create({
          event_name: env.STRIPE_METER_EVENT_NAME,
          payload: { stripe_customer_id: sub.stripeCustomerId, value: "1" },
          identifier: identifier(orgId, period, unit),
        });
        sent = unit;
      } catch (err) {
        logger.warn({ err, orgId, unit }, "Stripe meter event failed; will retry on the next flush");
        break;
      }
    }

    if (sent > reported) {
      // High-water mark only ever moves forward, even when two flushes race.
      await prisma.$executeRaw`
        INSERT INTO usage_counters (id, org_id, metric, period, count, updated_at)
        VALUES (gen_random_uuid()::text, ${orgId}, 'ai_overage_reported', ${period}, ${sent}, now())
        ON CONFLICT (org_id, metric, period)
        DO UPDATE SET count = GREATEST(usage_counters.count, ${sent}), updated_at = now()`;
    }
    return sent - reported;
  },

  /** Background sweep: retries anything that failed to reach Stripe (this month and last). */
  async flushPending(now = new Date()): Promise<number> {
    if (!billingConfigured()) return 0;
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const rows = await prisma.$queryRaw<{ org_id: string; period: string }[]>`
      SELECT o.org_id, o.period
      FROM usage_counters o
      LEFT JOIN usage_counters r
        ON r.org_id = o.org_id AND r.period = o.period AND r.metric = 'ai_overage_reported'
      WHERE o.metric = 'ai_overage' AND o.period >= ${currentPeriod(prev)} AND o.count > COALESCE(r.count, 0)
      LIMIT 100`;
    let total = 0;
    for (const row of rows) total += await this.flush(row.org_id, row.period);
    return total;
  },

  async setEnabled(orgId: string, enabled: boolean) {
    const sub = await prisma.subscription.findUnique({ where: { orgId } });
    if (!sub) return { updated: false as const };
    await prisma.subscription.update({ where: { id: sub.id }, data: { overageEnabled: enabled } });
    return { updated: true as const };
  },
};
