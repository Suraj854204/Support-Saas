import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    ticket: { findFirst: vi.fn(), update: vi.fn() },
    ticketMessage: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
  files: { assertLinkable: vi.fn(), link: vi.fn(), upload: vi.fn() },
}));
vi.mock("@/modules/chat-attachments/chat-attachments.service", () => ({
  ATTACHMENT_SELECT: { id: true, filename: true },
  chatAttachmentsService: m.files,
  presentMessage: (msg: Record<string, unknown>) => ({ ...msg, attachments: (msg.attachments as unknown[] | undefined) ?? [] }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/ai-client", () => ({ aiClient: { bestEffort: vi.fn().mockResolvedValue(null), summarizeTicket: vi.fn() } }));
vi.mock("@/modules/automations/automation-engine.service", () => ({ automationEngine: { run: vi.fn() } }));
vi.mock("@/modules/sla/sla-policy", () => ({ computeSlaDueDates: vi.fn(), resolveBusinessHours: vi.fn(), resolveSlaPolicy: vi.fn() }));
vi.mock("../ai-reply.service", () => ({ CUSTOMER_MESSAGE_SELECT: { id: true } }));

import { widgetService } from "../widget.service";

const dup = () => new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });

describe("widgetService tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads a conversation only for the same org AND customer", async () => {
    m.prisma.ticket.findFirst.mockResolvedValue(null);
    await expect(widgetService.getConversation("orgB", "custA", "t1")).rejects.toThrow(/not found/i);
    expect(m.prisma.ticket.findFirst.mock.calls[0]![0].where).toEqual({ id: "t1", orgId: "orgB", customerId: "custA" });
  });

  it("never selects internal notes and uses the customer-safe field list", async () => {
    m.prisma.ticket.findFirst.mockResolvedValue({ id: "t1", messages: [] });
    await widgetService.getConversation("o", "c", "t1");
    const include = m.prisma.ticket.findFirst.mock.calls[0]![0].include.messages;
    expect(include.where).toEqual({ isInternalNote: false });
    expect(include.select).toEqual({ id: true, attachments: { select: { id: true, filename: true } } });
  });

  it("cannot post into another customer's or org's ticket", async () => {
    m.prisma.ticket.findFirst.mockResolvedValue(null);
    await expect(widgetService.addCustomerMessage("orgB", "custX", "t1", "hi", "client-id-1234")).rejects.toThrow(/not found/i);
    expect(m.prisma.ticketMessage.create).not.toHaveBeenCalled();
  });
});

describe("widgetService.addCustomerMessage idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.ticket.findFirst.mockResolvedValue({ id: "t1" });
    m.prisma.ticket.update.mockResolvedValue({ id: "t1" });
    m.prisma.ticketMessage.findMany.mockResolvedValue([]);
    m.prisma.ticketMessage.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, body: "hi" }));
  });

  it("stores a new message", async () => {
    m.prisma.ticketMessage.create.mockResolvedValue({ id: "m1", body: "hi" });
    const r = await widgetService.addCustomerMessage("o", "c", "t1", "hi", "client-id-1234");
    expect(r).toMatchObject({ duplicate: false, message: { id: "m1" } });
    expect(m.prisma.ticketMessage.create.mock.calls[0]![0].data.clientMessageId).toBe("client-id-1234");
  });

  it("a retry with the same client id returns the original and flags duplicate", async () => {
    m.prisma.ticketMessage.create.mockRejectedValue(dup());
    m.prisma.ticketMessage.findFirst.mockResolvedValue({ id: "m1", body: "hi" });
    const r = await widgetService.addCustomerMessage("o", "c", "t1", "hi", "client-id-1234");
    expect(r).toMatchObject({ duplicate: true, message: { id: "m1" } });
    expect(m.prisma.ticket.update).not.toHaveBeenCalled(); // no second activity bump / automation
  });

  it("checks the attachments BEFORE storing the message, then links them to it", async () => {
    const order: string[] = [];
    m.files.assertLinkable.mockImplementation(async () => void order.push("check"));
    m.prisma.ticketMessage.create.mockImplementation(async () => (order.push("create"), { id: "m1", body: "" }));
    m.files.link.mockImplementation(async () => void order.push("link"));
    await widgetService.addCustomerMessage("o", "c", "t1", "", "client-id-1234", ["a1"]);
    expect(order).toEqual(["check", "create", "link"]);
    expect(m.files.assertLinkable).toHaveBeenCalledWith("o", "t1", ["a1"], { type: "customer", id: "c" });
    expect(m.files.link).toHaveBeenCalledWith("o", "t1", "m1", ["a1"], { type: "customer", id: "c" });
  });

  it("a bad attachment id stops the message from being stored at all", async () => {
    m.files.assertLinkable.mockRejectedValue(new Error("gone"));
    await expect(widgetService.addCustomerMessage("o", "c", "t1", "hi", "client-id-1234", ["x"])).rejects.toThrow("gone");
    expect(m.prisma.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("a visitor can only upload into their own conversation", async () => {
    m.prisma.ticket.findFirst.mockResolvedValue(null);
    await expect(widgetService.uploadFile("orgB", "custX", "t1", { buffer: Buffer.from("x"), originalname: "a.png" })).rejects.toThrow(/not found/i);
    expect(m.files.upload).not.toHaveBeenCalled();
    expect(m.prisma.ticket.findFirst.mock.calls[0]![0].where).toEqual({ id: "t1", orgId: "orgB", customerId: "custX" });
  });

  it("without a client id a unique violation is still an error (not silently swallowed)", async () => {
    m.prisma.ticketMessage.create.mockRejectedValue(dup());
    await expect(widgetService.addCustomerMessage("o", "c", "t1", "hi")).rejects.toThrow();
  });
});
