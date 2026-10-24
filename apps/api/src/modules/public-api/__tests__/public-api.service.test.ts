import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    ticket: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
  findOrCreateByEmail: vi.fn(),
  ticketsCreate: vi.fn(),
  addCustomerMessage: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/modules/customers/customers.service", () => ({ customersService: { findOrCreateByEmail: mocks.findOrCreateByEmail } }));
vi.mock("@/modules/tickets/tickets.service", () => ({ ticketsService: { create: mocks.ticketsCreate } }));
vi.mock("@/modules/widget/widget.service", () => ({ widgetService: { addCustomerMessage: mocks.addCustomerMessage } }));

import { publicCreateTicketSchema } from "../public-api.schema";
import { publicApiService, toPublicTicket } from "../public-api.service";

beforeEach(() => vi.clearAllMocks());

describe("publicApiService.createTicket", () => {
  const input = {
    subject: "Where is my order?",
    message: "It has been 10 days",
    priority: "normal" as const,
    customer: { email: "Jane@Example.com", name: "Jane" },
  };

  it("creates the ticket through the normal ticket service with the api channel", async () => {
    mocks.findOrCreateByEmail.mockResolvedValue({ id: "c1", isBlocked: false, deletedAt: null });
    mocks.ticketsCreate.mockResolvedValue({ id: "t1" });

    await publicApiService.createTicket("org1", "key1", input);

    expect(mocks.findOrCreateByEmail).toHaveBeenCalledWith("org1", "Jane@Example.com", "Jane");
    expect(mocks.ticketsCreate).toHaveBeenCalledWith("org1", "api_key:key1", {
      subject: "Where is my order?",
      customerId: "c1",
      channel: "api",
      priority: "normal",
      initialMessage: "It has been 10 days",
    });
  });

  it("refuses blocked and deleted customers", async () => {
    mocks.findOrCreateByEmail.mockResolvedValueOnce({ id: "c1", isBlocked: true, deletedAt: null });
    await expect(publicApiService.createTicket("org1", "key1", input)).rejects.toMatchObject({ statusCode: 403 });

    mocks.findOrCreateByEmail.mockResolvedValueOnce({ id: "c1", isBlocked: false, deletedAt: new Date() });
    await expect(publicApiService.createTicket("org1", "key1", input)).rejects.toMatchObject({ statusCode: 409 });

    expect(mocks.ticketsCreate).not.toHaveBeenCalled();
  });
});

describe("publicApiService reads", () => {
  it("never returns internal notes and is scoped to the key's org", async () => {
    mocks.prisma.ticket.findFirst.mockResolvedValue({ id: "t1", messages: [] });

    await publicApiService.getTicket("org1", "t1");

    const arg = mocks.prisma.ticket.findFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      select: { messages: { where: Record<string, unknown> } };
    };
    expect(arg.where).toEqual({ id: "t1", orgId: "org1" });
    expect(arg.select.messages.where).toEqual({ isInternalNote: false });
  });

  it("only selects allow-listed ticket fields (no AI summary, SLA or assignee internals)", async () => {
    mocks.prisma.ticket.findFirst.mockResolvedValue({ id: "t1", messages: [] });
    await publicApiService.getTicket("org1", "t1");

    const select = (mocks.prisma.ticket.findFirst.mock.calls[0]?.[0] as { select: Record<string, unknown> }).select;
    for (const forbidden of ["aiSummary", "aiSentiment", "slaBreachAt", "assigneeId", "emailReplyToken", "orgId", "customerId"]) {
      expect(select).not.toHaveProperty(forbidden);
    }
  });

  it("404s for a ticket in another org", async () => {
    mocks.prisma.ticket.findFirst.mockResolvedValue(null);
    await expect(publicApiService.getTicket("org1", "foreign")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists only the key's org's tickets, with pagination meta", async () => {
    mocks.prisma.ticket.findMany.mockResolvedValue([{ id: "t1" }]);
    mocks.prisma.ticket.count.mockResolvedValue(51);

    const result = await publicApiService.listTickets("org1", { status: "open", page: 2, pageSize: 25 });

    const arg = mocks.prisma.ticket.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown>; skip: number; take: number };
    expect(arg.where).toEqual({ orgId: "org1", status: "open" });
    expect(arg.skip).toBe(25);
    expect(arg.take).toBe(25);
    expect(result.meta).toEqual({ page: 2, pageSize: 25, totalItems: 51, totalPages: 3 });
  });
});

describe("publicApiService.addCustomerMessage", () => {
  it("uses the ticket's own customer, scoped to the org", async () => {
    mocks.prisma.ticket.findFirst.mockResolvedValue({ customerId: "c9" });
    mocks.addCustomerMessage.mockResolvedValue({ id: "m1" });

    await publicApiService.addCustomerMessage("org1", "t1", "hello");

    expect(mocks.prisma.ticket.findFirst).toHaveBeenCalledWith({ where: { id: "t1", orgId: "org1" }, select: { customerId: true } });
    expect(mocks.addCustomerMessage).toHaveBeenCalledWith("org1", "c9", "t1", "hello");
  });

  it("404s for another org's ticket without writing anything", async () => {
    mocks.prisma.ticket.findFirst.mockResolvedValue(null);

    await expect(publicApiService.addCustomerMessage("org1", "foreign", "hi")).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.addCustomerMessage).not.toHaveBeenCalled();
  });
});

describe("toPublicTicket", () => {
  it("keeps only the public fields", () => {
    const out = toPublicTicket({
      id: "t1",
      number: 7,
      subject: "s",
      status: "open",
      priority: "high",
      channel: "api",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      resolvedAt: null,
      aiSummary: "secret summary",
      assigneeId: "u1",
      orgId: "org1",
      customerId: "c1",
    });

    expect(Object.keys(out).sort()).toEqual(
      ["channel", "createdAt", "id", "number", "priority", "resolvedAt", "status", "subject", "updatedAt"].sort()
    );
  });
});

describe("publicCreateTicketSchema", () => {
  it("requires a valid customer email and a message", () => {
    expect(publicCreateTicketSchema.safeParse({ subject: "s", message: "m", customer: { email: "nope" } }).success).toBe(false);
    expect(publicCreateTicketSchema.safeParse({ subject: "s", customer: { email: "a@b.co" } }).success).toBe(false);
    expect(publicCreateTicketSchema.safeParse({ subject: "s", message: "m", customer: { email: "a@b.co" } }).success).toBe(true);
  });

  it("defaults priority and rejects invalid priorities", () => {
    const ok = publicCreateTicketSchema.parse({ subject: "s", message: "m", customer: { email: "a@b.co" } });
    expect(ok.priority).toBe("normal");
    expect(publicCreateTicketSchema.safeParse({ subject: "s", message: "m", priority: "asap", customer: { email: "a@b.co" } }).success).toBe(false);
  });
});
