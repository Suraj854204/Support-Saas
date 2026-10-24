import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const tx = {
    organization: { update: vi.fn().mockResolvedValue({ nextTicketNumber: 11 }) },
    ticket: { create: vi.fn().mockResolvedValue({ id: "t" }), deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
    ticketMessage: { create: vi.fn() },
    customer: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
  };
  return {
    tx,
    prisma: {
      ticket: { count: vi.fn() },
      customer: { upsert: vi.fn().mockResolvedValue({ id: "c" }) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));

import { DEMO_EMAIL_DOMAIN, DEMO_TAG, DEMO_TICKETS, demoDataService } from "../demo-data.service";

describe("demoDataService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("seeds tagged tickets on the reserved demo domain, without touching automations or e-mail", async () => {
    m.prisma.ticket.count.mockResolvedValue(0);
    const out = await demoDataService.seed("o1", "u1");
    expect(out.tickets).toBe(DEMO_TICKETS.length);
    expect(m.tx.ticket.create).toHaveBeenCalledTimes(DEMO_TICKETS.length);
    for (const call of m.tx.ticket.create.mock.calls) expect(call[0].data.tags).toEqual([DEMO_TAG]);
    for (const call of m.prisma.customer.upsert.mock.calls) expect(call[0].create.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
  });

  it("refuses to seed twice", async () => {
    m.prisma.ticket.count.mockResolvedValue(5);
    await expect(demoDataService.seed("o1", "u1")).rejects.toThrow("already loaded");
    expect(m.tx.ticket.create).not.toHaveBeenCalled();
  });

  it("clear only deletes demo-tagged tickets and demo-domain customers with no tickets left", async () => {
    await demoDataService.clear("o1", "u1");
    expect(m.tx.ticket.deleteMany).toHaveBeenCalledWith({ where: { orgId: "o1", tags: { has: DEMO_TAG } } });
    expect(m.tx.customer.deleteMany).toHaveBeenCalledWith({
      where: { orgId: "o1", email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, tickets: { none: {} } },
    });
  });
});
