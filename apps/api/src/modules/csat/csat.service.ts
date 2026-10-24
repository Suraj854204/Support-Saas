import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

const RATABLE = new Set(["solved", "closed"]);

export interface CsatSummary {
  days: number;
  responses: number;
  /** 1-5, one decimal; null when nobody has rated yet. */
  average: number | null;
  /** Share of responses rated 4 or 5, in percent (whole number); null when nobody has rated yet. */
  satisfiedPercent: number | null;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  recent: { ticketNumber: number; subject: string; rating: number; comment: string | null; createdAt: string }[];
}

export const csatService = {
  /** Records (or changes) the customer's rating of a ticket. The ticket must be resolved. */
  async submit(ticketId: string, rating: number, comment?: string | null) {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, orgId: true, status: true } });
    if (!ticket) throw AppError.notFound("Ticket not found");
    if (!RATABLE.has(ticket.status)) throw AppError.conflict("This request is still open. You can rate it once it has been resolved.");

    const cleaned = comment?.trim() ? comment.trim() : null;
    return prisma.csatResponse.upsert({
      where: { ticketId: ticket.id },
      create: { orgId: ticket.orgId, ticketId: ticket.id, rating, comment: cleaned },
      update: { rating, comment: cleaned },
      select: { rating: true, comment: true },
    });
  },

  async forTicket(ticketId: string) {
    return prisma.csatResponse.findUnique({ where: { ticketId }, select: { rating: true, comment: true } });
  },

  async summary(orgId: string, days = 30, now = new Date()): Promise<CsatSummary> {
    const since = new Date(now.getTime() - days * 86_400_000);
    const where = { orgId, createdAt: { gte: since } };

    const [grouped, recent] = await Promise.all([
      prisma.csatResponse.groupBy({ by: ["rating"], where, _count: { _all: true } }),
      prisma.csatResponse.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { rating: true, comment: true, createdAt: true, ticket: { select: { number: true, subject: true } } },
      }),
    ]);

    const distribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } as CsatSummary["distribution"];
    let total = 0;
    let sum = 0;
    for (const g of grouped) {
      const key = String(g.rating) as keyof CsatSummary["distribution"];
      if (!(key in distribution)) continue;
      distribution[key] = g._count._all;
      total += g._count._all;
      sum += g.rating * g._count._all;
    }

    return {
      days,
      responses: total,
      average: total ? Math.round((sum / total) * 10) / 10 : null,
      satisfiedPercent: total ? Math.round(((distribution["4"] + distribution["5"]) / total) * 100) : null,
      distribution,
      recent: recent.map((r) => ({
        ticketNumber: r.ticket.number,
        subject: r.ticket.subject,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },
};
