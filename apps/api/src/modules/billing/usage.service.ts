import { prisma } from "@/lib/prisma";

export type UsageMetric = "ai_replies" | "ai_overage" | "ai_overage_reported";

export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const usageService = {
  /**
   * Atomically takes `amount` from the month's allowance. One SQL statement does the check and the
   * increment, so two concurrent requests can never both pass when only one unit is left.
   * `limit === null` means unlimited (still counted, for the usage display).
   */
  async consume(orgId: string, metric: UsageMetric, limit: number | null, amount = 1, now = new Date()): Promise<{ allowed: boolean; used: number }> {
    const period = currentPeriod(now);
    if (limit !== null && amount > limit) return { allowed: false, used: await this.used(orgId, metric, now) };

    const rows =
      limit === null
        ? await prisma.$queryRaw<{ count: number }[]>`
            INSERT INTO usage_counters (id, org_id, metric, period, count, updated_at)
            VALUES (gen_random_uuid()::text, ${orgId}, ${metric}, ${period}, ${amount}, now())
            ON CONFLICT (org_id, metric, period)
            DO UPDATE SET count = usage_counters.count + ${amount}, updated_at = now()
            RETURNING count`
        : await prisma.$queryRaw<{ count: number }[]>`
            INSERT INTO usage_counters (id, org_id, metric, period, count, updated_at)
            VALUES (gen_random_uuid()::text, ${orgId}, ${metric}, ${period}, ${amount}, now())
            ON CONFLICT (org_id, metric, period)
            DO UPDATE SET count = usage_counters.count + ${amount}, updated_at = now()
            WHERE usage_counters.count + ${amount} <= ${limit}
            RETURNING count`;

    if (rows.length === 0) return { allowed: false, used: await this.used(orgId, metric, now) };
    return { allowed: true, used: Number(rows[0]!.count) };
  },

  async used(orgId: string, metric: UsageMetric, now = new Date()): Promise<number> {
    const row = await prisma.usageCounter.findUnique({
      where: { orgId_metric_period: { orgId, metric, period: currentPeriod(now) } },
      select: { count: true },
    });
    return row?.count ?? 0;
  },
};
