import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    ticket: { findFirst: vi.fn() },
    ticketEscalation: { upsert: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    ticketMessage: { create: vi.fn() },
  },
  update: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/modules/tickets/tickets.service", () => ({ ticketsService: { update: m.update } }));

import { dueAt, escalationsService, raisedPriority } from "../escalations.service";

describe("helpers", () => {
  it("only ever raises priority", () => {
    expect(raisedPriority("normal", "critical")).toBe("urgent");
    expect(raisedPriority("normal", "high")).toBe("high");
    expect(raisedPriority("urgent", "high")).toBeNull();
    expect(raisedPriority("high", "high")).toBeNull();
  });
  it("deadline is 24 hours later", () => {
    const t = new Date("2026-01-01T10:00:00Z");
    expect(dueAt(t).toISOString()).toBe("2026-01-02T10:00:00.000Z");
  });
});

describe("escalationsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.ticketEscalation.upsert.mockImplementation(async (a: { create: object }) => ({ ...a.create, contactDueAt: new Date() }));
  });

  it("evaluate does nothing for an ordinary message", async () => {
    expect(await escalationsService.evaluate({ orgId: "o", ticketId: "t", text: "What are your hours?" })).toBeNull();
    expect(m.prisma.ticketEscalation.upsert).not.toHaveBeenCalled();
  });

  it("escalates a defect: raises priority, tags, creates deadline and a private note", async () => {
    m.prisma.ticket.findFirst.mockResolvedValue({ id: "t", priority: "normal", tags: ["form:f1"], escalation: null });
    await escalationsService.evaluate({ orgId: "o", ticketId: "t", text: "The heater is defective and smoking", preferredMethod: "call" });
    expect(m.prisma.ticketEscalation.upsert.mock.calls[0]![0].create).toMatchObject({ level: "critical", preferredMethod: "call" });
    expect(m.update).toHaveBeenCalledWith("o", "t", { priority: "urgent", tags: ["form:f1", "escalated"] }, undefined);
    expect(m.prisma.ticketMessage.create).toHaveBeenCalledTimes(1);
    expect(m.prisma.ticketMessage.create.mock.calls[0]![0].data.isInternalNote).toBe(true);
  });

  it("a second flag keeps the original deadline and writes no duplicate note", async () => {
    m.prisma.ticket.findFirst.mockResolvedValue({ id: "t", priority: "urgent", tags: ["escalated"], escalation: { level: "high", reasons: ["a"] } });
    await escalationsService.evaluate({ orgId: "o", ticketId: "t", text: "this is a fraud" });
    const call = m.prisma.ticketEscalation.upsert.mock.calls[0]![0];
    expect(call.update).not.toHaveProperty("contactDueAt");
    expect(call.update.level).toBe("critical");
    expect(m.update).not.toHaveBeenCalled();
    expect(m.prisma.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("never throws into ticket creation", async () => {
    m.prisma.ticket.findFirst.mockRejectedValue(new Error("db down"));
    await expect(escalationsService.evaluate({ orgId: "o", ticketId: "t", text: "defective and smoking" })).resolves.toBeNull();
  });

  it("logContact records who/how and refuses a second time", async () => {
    m.prisma.ticketEscalation.findFirst.mockResolvedValueOnce({ id: "e", ticketId: "t", contactedAt: null });
    m.prisma.ticketEscalation.update.mockResolvedValue({ id: "e" });
    await escalationsService.logContact("o", "e", "u", { method: "call", note: "Spoke, replacement sent" });
    expect(m.prisma.ticketEscalation.update.mock.calls[0]![0].data).toMatchObject({ contactMethod: "call", contactedById: "u" });
    m.prisma.ticketEscalation.findFirst.mockResolvedValueOnce({ id: "e", ticketId: "t", contactedAt: new Date() });
    await expect(escalationsService.logContact("o", "e", "u", { method: "message" })).rejects.toThrow("already contacted");
  });

  it("marks only uncontacted, past-deadline items as overdue", async () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const base = { level: "high", reasons: [], preferredMethod: null, contactedAt: null, contactMethod: null, contactNote: null, createdAt: now, ticket: { id: "t", number: 1, subject: "s", status: "open", customer: { name: null, email: "a@b.co", phone: null }, messages: [] } };
    m.prisma.ticketEscalation.findMany.mockResolvedValue([
      { ...base, id: "late", contactDueAt: new Date("2026-01-01T00:00:00Z") },
      { ...base, id: "ok", contactDueAt: new Date("2026-01-03T00:00:00Z") },
      { ...base, id: "done", contactDueAt: new Date("2026-01-01T00:00:00Z"), contactedAt: now },
    ]);
    const rows = await escalationsService.list("o", "all", now);
    expect(rows.map((r) => [r.id, r.overdue])).toEqual([["late", true], ["ok", false], ["done", false]]);
  });
});
