import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createdCounterKey, resolvedCounterKey } from "@/worker/analytics-consumer";

export interface TicketVolumePoint {
  date: string;
  created: number;
  resolved: number;
}

export interface AnalyticsSummary {
  openTickets: number;
  resolvedToday: number;
  avgFirstResponseMinutes: number | null;
  slaAtRisk: number;
}

function lastNDates(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// SLA heuristic: no per-org SLA policy configuration exists yet, so "at
// risk" uses a simple, documented rule instead of a fabricated number —
// urgent tickets unresolved past 4h, or high-priority ones past 24h.
const SLA_URGENT_HOURS = 4;
const SLA_HIGH_HOURS = 24;

export const analyticsService = {
  async getTicketVolume(orgId: string, days: number): Promise<TicketVolumePoint[]> {
    const dates = lastNDates(days);

    const createdKeys = dates.map((d) => createdCounterKey(orgId, d));
    const resolvedKeys = dates.map((d) => resolvedCounterKey(orgId, d));

    const [createdCounts, resolvedCounts] = await Promise.all([
      redis.mget(...createdKeys),
      redis.mget(...resolvedKeys),
    ]);

    return dates.map((date, i) => ({
      date,
      created: Number(createdCounts[i] ?? 0),
      resolved: Number(resolvedCounts[i] ?? 0),
    }));
  },

  async getSummary(orgId: string): Promise<AnalyticsSummary> {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    const now = new Date();
    const urgentCutoff = new Date(now.getTime() - SLA_URGENT_HOURS * 60 * 60 * 1000);
    const highCutoff = new Date(now.getTime() - SLA_HIGH_HOURS * 60 * 60 * 1000);

    const [openTickets, resolvedToday, slaAtRisk, ticketsWithFirstReply] = await Promise.all([
      prisma.ticket.count({ where: { orgId, status: { in: ["open", "pending", "on_hold"] } } }),

      prisma.ticket.count({
        where: { orgId, resolvedAt: { gte: startOfToday } },
      }),

      prisma.ticket.count({
        where: {
          orgId,
          status: { in: ["open", "pending", "on_hold"] },
          OR: [
            { priority: "urgent", createdAt: { lte: urgentCutoff } },
            { priority: "high", createdAt: { lte: highCutoff } },
          ],
        },
      }),

      prisma.ticket.findMany({
        where: { orgId, createdAt: { gte: thirtyDaysAgo } },
        select: {
          createdAt: true,
          messages: {
            where: { authorType: "agent" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
    ]);

    type TicketWithFirstReply = { createdAt: Date; messages: { createdAt: Date }[] };

    const responseTimesMinutes = (ticketsWithFirstReply as TicketWithFirstReply[])
      .map((t) => {
        const firstReply = t.messages[0];
        return firstReply ? (firstReply.createdAt.getTime() - t.createdAt.getTime()) / 60000 : null;
      })
      .filter((v): v is number => v !== null);

    const avgFirstResponseMinutes =
      responseTimesMinutes.length > 0
        ? Math.round(responseTimesMinutes.reduce((a: number, b: number) => a + b, 0) / responseTimesMinutes.length)
        : null;

    return { openTickets, resolvedToday, avgFirstResponseMinutes, slaAtRisk };
  },
};
