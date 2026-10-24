import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const tx = {
    organization: { update: vi.fn() },
    ticket: { create: vi.fn() },
    ticketMessage: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      ticket: { findMany: vi.fn() },
      customer: { findMany: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    findOrCreate: vi.fn(),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/modules/customers/customers.service", () => ({ customersService: { findOrCreateByEmail: m.findOrCreate } }));

import { importsService } from "../imports.service";

const csv = [
  "Ticket ID,Requester,Requester email,Subject,Description,Status,Priority,Created at",
  "1,A,a@x.io,One,first,solved,low,2024-01-01T00:00:00Z",
  "2,B,b@x.io,Two,second,open,high,2024-01-02T00:00:00Z",
  "3,C,bad,Three,third,open,low,2024-01-03",
].join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.ticket.findMany.mockResolvedValue([]);
  m.prisma.customer.findMany.mockResolvedValue([{ email: "a@x.io" }]);
  m.prisma.auditLog.create.mockResolvedValue({});
  m.findOrCreate.mockResolvedValue({ id: "cust1" });
  m.tx.organization.update.mockResolvedValue({ nextTicketNumber: 11 });
  m.tx.ticket.create.mockResolvedValue({ id: "t1" });
});

describe("importsService.importTickets", () => {
  it("dry run reports what would happen and writes nothing", async () => {
    const s = await importsService.importTickets("org1", "u1", csv, true);

    expect(s).toMatchObject({ dryRun: true, totalRows: 3, valid: 2, invalid: 1, duplicates: 0, toCreate: 2, created: 0, newCustomers: 1 });
    expect(s.errors[0]).toMatchObject({ line: 4 });
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.findOrCreate).not.toHaveBeenCalled();
    expect(m.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("creates tickets with original dates, tags and message, scoped to the org", async () => {
    const s = await importsService.importTickets("org1", "u1", csv, false);

    expect(s).toMatchObject({ created: 2, failed: 0, invalid: 1 });
    expect(m.findOrCreate).toHaveBeenCalledWith("org1", "a@x.io", "A");
    const first = (m.tx.ticket.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(first).toMatchObject({
      orgId: "org1",
      number: 10,
      status: "solved",
      channel: "api",
      tags: ["imported", "zd-1"],
    });
    expect((first.createdAt as Date).toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(first.resolvedAt).toEqual(first.createdAt);
    expect(m.tx.ticketMessage.create).toHaveBeenCalledTimes(2);
    expect(m.prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("skips tickets that were already imported (safe to re-run the same file)", async () => {
    m.prisma.ticket.findMany.mockResolvedValue([{ tags: ["imported", "zd-1"] }]);

    const s = await importsService.importTickets("org1", "u1", csv, false);

    expect(s).toMatchObject({ duplicates: 1, created: 1 });
    expect(m.prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ orgId: "org1" }) }));
  });

  it("one failing row does not abort the rest", async () => {
    m.tx.ticket.create.mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ id: "t2" });

    const s = await importsService.importTickets("org1", "u1", csv, false);

    expect(s).toMatchObject({ created: 1, failed: 1 });
  });

  it("rejects an empty body and blocks a second concurrent import for the same org", async () => {
    await expect(importsService.importTickets("org1", "u1", "  ", true)).rejects.toMatchObject({ statusCode: 422 });

    let release: (v: unknown[]) => void = () => undefined;
    m.prisma.ticket.findMany.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const first = importsService.importTickets("org1", "u1", csv, true);
    await vi.waitFor(() => expect(m.prisma.ticket.findMany).toHaveBeenCalled());

    await expect(importsService.importTickets("org1", "u2", csv, true)).rejects.toMatchObject({ statusCode: 409 });
    release([]);
    await first;
    await expect(importsService.importTickets("org1", "u1", csv, true)).resolves.toBeDefined();
  });
});
