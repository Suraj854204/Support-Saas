import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: { intakeForm: { findUnique: vi.fn() } },
  suggest: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/ai-client", () => ({ aiClient: { suggestReplyUntraced: m.suggest } }));
vi.mock("@/modules/tickets/tickets.service", () => ({ ticketsService: {} }));
vi.mock("@/modules/customers/customers.service", () => ({ customersService: {} }));
vi.mock("@/modules/escalations/escalations.service", () => ({ escalationsService: {} }));

import { assistantService, decideReply, MIN_CONFIDENCE } from "../assistant.service";

import { assessSeverity } from "@/modules/escalations/severity";

const none = assessSeverity("what are your hours");
const high = assessSeverity("I want a refund, the item was damaged");
const critical = assessSeverity("the heater is defective and smoking");
const form = { id: "f1", orgId: "o1", name: "Help", isActive: true, source: "assistant", allowedOrigins: [] as string[] };

describe("decideReply", () => {
  const good = { suggestedReply: "We open 9 to 6.", confidence: 0.8, sourceTitles: ["Opening hours"], severity: none };

  it("answers from the knowledge base when it is backed by an article", () => {
    expect(decideReply(good)).toMatchObject({ reply: "We open 9 to 6.", handoff: false, urgent: false, sources: ["Opening hours"] });
  });
  it("does not guess when confidence is low or no article matched", () => {
    expect(decideReply({ ...good, confidence: MIN_CONFIDENCE - 0.01 })).toMatchObject({ handoff: true, sources: [] });
    expect(decideReply({ ...good, sourceTitles: [] }).reply).toMatch(/don't want to guess/);
  });
  it("critical matters never get an AI answer and promise a person within 24h", () => {
    const r = decideReply({ ...good, severity: critical });
    expect(r).toMatchObject({ handoff: true, urgent: true, contactWithinHours: 24, sources: [] });
    expect(r.reply).not.toContain("We open");
  });
  it("high matters get the answer plus the human follow-up", () => {
    const r = decideReply({ ...good, severity: high });
    expect(r.reply).toContain("We open 9 to 6.");
    expect(r).toMatchObject({ handoff: true, urgent: true, contactWithinHours: 24 });
  });
});

describe("assistantService.chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.intakeForm.findUnique.mockResolvedValue(form);
  });

  it("only works for assistant-type, active keys and allowed sites (all look like 'not available')", async () => {
    m.prisma.intakeForm.findUnique.mockResolvedValueOnce({ ...form, source: "web" });
    await expect(assistantService.chat("k", undefined, { message: "hi", history: [] })).rejects.toThrow("not available");
    m.prisma.intakeForm.findUnique.mockResolvedValueOnce({ ...form, isActive: false });
    await expect(assistantService.chat("k", undefined, { message: "hi", history: [] })).rejects.toThrow("not available");
    m.prisma.intakeForm.findUnique.mockResolvedValueOnce({ ...form, allowedOrigins: ["https://shop.com"] });
    await expect(assistantService.chat("k", "https://evil.com", { message: "hi", history: [] })).rejects.toThrow("not allowed");
    expect(m.suggest).not.toHaveBeenCalled();
  });

  it("sends the conversation to the AI scoped to the form's organisation", async () => {
    m.suggest.mockResolvedValue({ suggested_reply: "9 to 6", confidence: 0.9, source_articles: [{ article_id: "a", title: "Hours", similarity: 0.9 }] });
    const r = await assistantService.chat("k", undefined, { message: "and weekends?", history: [{ role: "visitor", text: "hours?" }, { role: "assistant", text: "9 to 6" }] });
    const arg = m.suggest.mock.calls[0]![0];
    expect(arg.orgId).toBe("o1");
    expect(arg.messages.map((x: { author_type: string }) => x.author_type)).toEqual(["customer", "ai", "customer"]);
    expect(r.reply).toBe("9 to 6");
  });

  it("skips the AI for a critical matter", async () => {
    const r = await assistantService.chat("k", undefined, { message: "My charger is smoking and defective", history: [] });
    expect(m.suggest).not.toHaveBeenCalled();
    expect(r).toMatchObject({ urgent: true, handoff: true });
  });

  it("hands over to the team when the AI service is down", async () => {
    m.suggest.mockRejectedValue(new Error("ai down"));
    const r = await assistantService.chat("k", undefined, { message: "hello", history: [] });
    expect(r).toMatchObject({ handoff: true, urgent: false });
  });
});
