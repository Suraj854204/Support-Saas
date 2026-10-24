import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    ticket: { findUnique: vi.fn() },
    csatResponse: { upsert: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));

import { csatService } from "../csat.service";

beforeEach(() => vi.clearAllMocks());

describe("csatService.submit", () => {
  it("rejects an unknown ticket and an unresolved ticket", async () => {
    m.prisma.ticket.findUnique.mockResolvedValue(null);
    await expect(csatService.submit("t", 5)).rejects.toMatchObject({ statusCode: 404 });
    m.prisma.ticket.findUnique.mockResolvedValue({ id: "t", orgId: "o", status: "open" });
    await expect(csatService.submit("t", 5)).rejects.toMatchObject({ statusCode: 409 });
    expect(m.prisma.csatResponse.upsert).not.toHaveBeenCalled();
  });
  it("stores one rating per ticket (upsert) inside the ticket's own organization", async () => {
    m.prisma.ticket.findUnique.mockResolvedValue({ id: "t", orgId: "orgA", status: "solved" });
    m.prisma.csatResponse.upsert.mockResolvedValue({ rating: 4, comment: null });
    await csatService.submit("t", 4, "   ");
    const a = m.prisma.csatResponse.upsert.mock.calls[0]![0];
    expect(a.where).toEqual({ ticketId: "t" });
    expect(a.create).toEqual({ orgId: "orgA", ticketId: "t", rating: 4, comment: null });
  });
});

describe("csatService.summary", () => {
  it("is empty (null average) with no responses", async () => {
    m.prisma.csatResponse.groupBy.mockResolvedValue([]);
    m.prisma.csatResponse.findMany.mockResolvedValue([]);
    const s = await csatService.summary("o");
    expect(s).toMatchObject({ responses: 0, average: null, satisfiedPercent: null });
  });
  it("computes average, satisfied share and distribution, scoped to the org and period", async () => {
    m.prisma.csatResponse.groupBy.mockResolvedValue([
      { rating: 5, _count: { _all: 6 } },
      { rating: 4, _count: { _all: 2 } },
      { rating: 1, _count: { _all: 2 } },
    ]);
    m.prisma.csatResponse.findMany.mockResolvedValue([
      { rating: 1, comment: "slow", createdAt: new Date("2026-10-20T00:00:00Z"), ticket: { number: 7, subject: "Late order" } },
    ]);
    const now = new Date("2026-10-23T00:00:00Z");
    const s = await csatService.summary("orgA", 30, now);
    expect(s.responses).toBe(10);
    expect(s.average).toBe(4); // (30 + 8 + 2) / 10
    expect(s.satisfiedPercent).toBe(80);
    expect(s.distribution).toEqual({ "1": 2, "2": 0, "3": 0, "4": 2, "5": 6 });
    expect(s.recent[0]).toMatchObject({ ticketNumber: 7, rating: 1, comment: "slow" });
    const where = m.prisma.csatResponse.groupBy.mock.calls[0]![0].where;
    expect(where.orgId).toBe("orgA");
    expect(where.createdAt.gte).toEqual(new Date("2026-09-23T00:00:00Z"));
  });
});
