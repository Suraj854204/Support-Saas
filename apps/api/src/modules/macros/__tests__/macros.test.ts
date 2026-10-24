import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    macro: { findFirst: vi.fn() },
    ticket: { findFirst: vi.fn() },
  },
  addMessage: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/modules/tickets/tickets.service", () => ({ ticketsService: { addMessage: m.addMessage, update: m.update } }));

import { createMacroSchema } from "../macros.schema";
import { macrosService, planMacro, renderMacroReply } from "../macros.service";

const base = { replyBody: null, setStatus: null, setPriority: null, addTags: [] as string[] };

describe("planMacro", () => {
  it("merges tags without duplicates and never drops existing ones", () => {
    const plan = planMacro({ ...base, addTags: ["refund", "vip"] }, { tags: ["vip", "billing"] });
    expect(plan.update.tags).toEqual(["vip", "billing", "refund"]);
  });
  it("leaves tags alone when nothing new is added", () => {
    expect(planMacro({ ...base, addTags: ["vip"] }, { tags: ["vip"] }).update).toEqual({});
  });
  it("sets status and priority only when the macro defines them", () => {
    expect(planMacro({ ...base, setStatus: "solved" }, { tags: [] }).update).toEqual({ status: "solved" });
  });
});

describe("renderMacroReply", () => {
  it("fills first name and agent name", () => {
    expect(renderMacroReply("Hi {{customer_name}}, {{ agent_name }} here", { customerName: "Asha Rao", agentName: "Suraj" })).toBe("Hi Asha, Suraj here");
  });
  it("falls back to 'there' with no customer name", () => {
    expect(renderMacroReply("Hi {{customer_name}}", { customerName: null, agentName: "S" })).toBe("Hi there");
  });
});

describe("createMacroSchema", () => {
  it("rejects a macro that does nothing", () => {
    expect(createMacroSchema.safeParse({ name: "Empty" }).success).toBe(false);
  });
  it("accepts a tags-only macro", () => {
    expect(createMacroSchema.safeParse({ name: "Tag it", addTags: ["x"] }).success).toBe(true);
  });
});

describe("macrosService.apply", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replies then updates through the normal ticket service", async () => {
    m.prisma.macro.findFirst.mockResolvedValue({ ...base, id: "m1", replyBody: "Hi {{customer_name}}", setStatus: "solved" });
    m.prisma.ticket.findFirst.mockResolvedValue({ id: "t1", tags: [], customer: { name: "Asha Rao" } });
    const out = await macrosService.apply("o1", "m1", "t1", { userId: "u1", name: "Suraj" });
    expect(m.addMessage).toHaveBeenCalledWith("o1", "t1", "u1", { body: "Hi Asha", bodyFormat: "text", isInternalNote: false });
    expect(m.update).toHaveBeenCalledWith("o1", "t1", { status: "solved" }, "u1");
    expect(out).toEqual({ replied: true, changed: ["status"] });
  });

  it("is org-scoped: unknown macro or ticket is a not-found", async () => {
    m.prisma.macro.findFirst.mockResolvedValue(null);
    await expect(macrosService.apply("o1", "x", "t1", { userId: "u", name: "n" })).rejects.toThrow("Macro not found");
    m.prisma.macro.findFirst.mockResolvedValue({ ...base, id: "m1", setStatus: "open" });
    m.prisma.ticket.findFirst.mockResolvedValue(null);
    await expect(macrosService.apply("o1", "m1", "t1", { userId: "u", name: "n" })).rejects.toThrow("Ticket not found");
    expect(m.update).not.toHaveBeenCalled();
  });
});
