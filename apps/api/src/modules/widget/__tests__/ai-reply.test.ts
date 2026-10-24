import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    ticket: { findFirst: vi.fn() },
    ticketMessage: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  suggestReply: vi.fn(),
  evaluate: vi.fn(),
  ticketUpdate: vi.fn(),
  markFirstResponse: vi.fn(),
  emitToOrg: vi.fn(),
  emitToWidget: vi.fn(),
  consumeAiReply: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/ai-client", () => ({ aiClient: { suggestReply: m.suggestReply } }));
vi.mock("@/modules/escalations/escalations.service", () => ({ escalationsService: { evaluate: m.evaluate } }));
vi.mock("@/modules/tickets/tickets.service", () => ({ ticketsService: { update: m.ticketUpdate } }));
vi.mock("@/modules/sla/sla.service", () => ({ slaService: { markFirstResponse: m.markFirstResponse } }));
vi.mock("@/modules/billing/entitlements.service", () => ({ entitlementsService: { consumeAiReply: m.consumeAiReply } }));
vi.mock("@/sockets", () => ({ emitToOrg: m.emitToOrg, emitToTicketWidgetRoom: m.emitToWidget }));

import { aiReplyService, detectIntent } from "../ai-reply.service";

const now = Date.now();
const msg = (id: string, authorType: string, body: string, extra: object = {}) => ({
  id,
  authorType,
  body,
  aiMeta: null,
  createdAt: new Date(now - 1000),
  ...extra,
});

function setup(opts: { mode?: string; tags?: string[]; status?: string; history: ReturnType<typeof msg>[] }) {
  m.prisma.organization.findUnique.mockResolvedValue({ aiReplyMode: opts.mode ?? "autopilot" });
  m.prisma.ticket.findFirst.mockResolvedValue({ id: "t1", tags: opts.tags ?? [], status: opts.status ?? "open" });
  m.prisma.ticketMessage.findMany.mockResolvedValue(opts.history);
  m.prisma.ticketMessage.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({
    id: "ai-msg",
    ticketId: "t1",
    createdAt: new Date(),
    aiMeta: a.data.aiMeta ?? null,
    ...a.data,
  }));
  m.prisma.ticketMessage.update.mockResolvedValue({});
}
const run = () => aiReplyService.handleCustomerMessage({ orgId: "o1", ticketId: "t1", customerMessageId: "c1" });
const aiCreate = () =>
  m.prisma.ticketMessage.create.mock.calls.map((c) => c[0].data).find((d: { authorType: string }) => d.authorType === "ai");

describe("detectIntent", () => {
  it.each([
    ["I want to talk to a human", "human_request"],
    ["I was charged twice for my plan", "payment_dispute"],
    ["please give me a refund", "refund"],
    ["someone hacked my account", "account_security"],
    ["where is my order?", "order_status"],
    ["How do I change my avatar?", "general"],
  ])("%s -> %s", (text, intent) => expect(detectIntent(text)).toBe(intent));
});

describe("aiReplyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.evaluate.mockResolvedValue(null);
    m.consumeAiReply.mockResolvedValue(true);
  });

  it("sends a grounded answer, stores it once with an idempotency key, and marks first response", async () => {
    setup({ history: [msg("c1", "customer", "How do I reset my password?")] });
    m.suggestReply.mockResolvedValue({
      suggested_reply: "Go to Settings > Security.",
      confidence: 0.8,
      source_articles: [{ article_id: "a1", title: "Password reset", similarity: 0.9 }],
    });

    const out = await run();

    expect(out.outcome).toBe("replied");
    expect(aiCreate()).toMatchObject({
      authorType: "ai",
      aiGenerated: true,
      clientMessageId: "ai:c1",
      deliveryStatus: "pending",
      body: "Go to Settings > Security.",
    });
    expect(m.emitToWidget).toHaveBeenCalledTimes(1);
    expect(m.prisma.ticketMessage.update).toHaveBeenCalledWith({ where: { id: "ai-msg" }, data: { deliveryStatus: "delivered" } });
    expect(m.markFirstResponse).toHaveBeenCalledWith("t1");
    expect(m.ticketUpdate).not.toHaveBeenCalled();
  });

  it("never exposes AI meta (confidence, sources) on the visitor's channel", async () => {
    setup({ history: [msg("c1", "customer", "How do I reset my password?")] });
    m.suggestReply.mockResolvedValue({
      suggested_reply: "Go to Settings.",
      confidence: 0.8,
      source_articles: [{ article_id: "a1", title: "Password reset", similarity: 0.9 }],
    });
    await run();
    expect(m.emitToWidget.mock.calls[0]![2]).not.toHaveProperty("aiMeta");
    expect(m.emitToWidget.mock.calls[0]![2]).not.toHaveProperty("authorId");
  });

  it("a retry of the same message does not produce a second reply (unique key)", async () => {
    setup({ history: [msg("c1", "customer", "How do I reset my password?")] });
    m.suggestReply.mockResolvedValue({
      suggested_reply: "Go to Settings.",
      confidence: 0.8,
      source_articles: [{ article_id: "a1", title: "T", similarity: 0.9 }],
    });
    m.prisma.ticketMessage.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));

    const out = await run();

    expect(out.outcome).toBe("duplicate");
    expect(m.emitToWidget).not.toHaveBeenCalled();
    expect(m.markFirstResponse).not.toHaveBeenCalled();
  });

  it("refunds go straight to a human: no AI call, no claim that a refund was made", async () => {
    setup({ history: [msg("c1", "customer", "I want a refund for my order")] });
    const out = await run();
    expect(out.outcome).toBe("handoff");
    expect(m.suggestReply).not.toHaveBeenCalled();
    expect(aiCreate().body).toMatch(/can't confirm a refund/i);
    expect(aiCreate().aiMeta).toMatchObject({ intent: "refund", decision: "handoff_intent" });
    expect(m.ticketUpdate).toHaveBeenCalledWith("o1", "t1", { tags: ["human-handoff"] });
  });

  it("an explicit request for a human hands over", async () => {
    setup({ history: [msg("c1", "customer", "let me talk to a real person")] });
    expect((await run()).outcome).toBe("handoff");
    expect(m.suggestReply).not.toHaveBeenCalled();
  });

  it("low confidence is not guessed: it hands over", async () => {
    setup({ history: [msg("c1", "customer", "Does the plan support unicorns?")] });
    m.suggestReply.mockResolvedValue({ suggested_reply: "Maybe.", confidence: 0.2, source_articles: [] });
    const out = await run();
    expect(out.outcome).toBe("handoff");
    expect(aiCreate().body).not.toBe("Maybe.");
    expect(m.markFirstResponse).not.toHaveBeenCalled();
  });

  it("critical matters skip the AI entirely and escalate", async () => {
    setup({ history: [msg("c1", "customer", "The heater is defective and smoking")] });
    const out = await run();
    expect(out.outcome).toBe("handoff");
    expect(m.suggestReply).not.toHaveBeenCalled();
    expect(m.evaluate).toHaveBeenCalledTimes(1);
  });

  it("AI outage becomes a handoff, not an error or a silent drop", async () => {
    setup({ history: [msg("c1", "customer", "How do I export data?")] });
    m.suggestReply.mockRejectedValue(new Error("timeout"));
    const out = await run();
    expect(out.outcome).toBe("handoff");
    expect(aiCreate().aiMeta).toMatchObject({ decision: "handoff_ai_unavailable" });
  });

  it("repeated unsuccessful attempts hand over", async () => {
    setup({
      history: [
        msg("c0", "customer", "weird question"),
        msg("a0", "ai", "not sure", { aiMeta: { decision: "handoff_low_confidence" } }),
        msg("c1", "customer", "another weird question"),
      ],
    });
    m.suggestReply.mockResolvedValue({ suggested_reply: "", confidence: 0.1, source_articles: [] });
    const out = await run();
    expect(out.outcome).toBe("handoff");
    expect(aiCreate().aiMeta).toMatchObject({ decision: "handoff_repeat" });
  });

  it("when the monthly AI allowance is used up it hands over without calling the AI", async () => {
    setup({ history: [msg("c1", "customer", "How do I export data?")] });
    m.consumeAiReply.mockResolvedValue(false);
    const out = await run();
    expect(out.outcome).toBe("handoff");
    expect(m.suggestReply).not.toHaveBeenCalled();
    expect(aiCreate().aiMeta).toMatchObject({ decision: "handoff_plan_limit" });
    expect(aiCreate().body).not.toMatch(/plan|upgrade|limit/i); // visitors are never told about billing
  });

  it("human-only topics do not use up the AI allowance", async () => {
    setup({ history: [msg("c1", "customer", "I want a refund")] });
    await run();
    expect(m.consumeAiReply).not.toHaveBeenCalled();
  });

  it("stays silent once a human has taken over (no AI talking over agents)", async () => {
    setup({ tags: ["human-handoff"], history: [msg("c1", "customer", "thanks, one more thing")] });
    expect((await run()).reason).toBe("human_has_taken_over");
    expect(m.suggestReply).not.toHaveBeenCalled();
  });

  it("stays silent after an agent replied", async () => {
    setup({ history: [msg("a1", "agent", "Hi"), msg("c1", "customer", "How do I export data?")] });
    expect((await run()).reason).toBe("agent_replied");
  });

  it("rate guard stops a runaway conversation", async () => {
    const ais = Array.from({ length: 6 }, (_, i) => msg(`a${i}`, "ai", "x"));
    setup({ history: [...ais, msg("c1", "customer", "How do I export data?")] });
    expect((await run()).reason).toBe("rate_guard");
    expect(m.suggestReply).not.toHaveBeenCalled();
  });

  it.each(["off", "copilot"])("in %s mode the AI never replies to the customer, but serious cases still escalate", async (mode) => {
    setup({ mode, history: [msg("c1", "customer", "This is a fraud, I will go to court")] });
    expect((await run()).outcome).toBe("skipped");
    expect(m.suggestReply).not.toHaveBeenCalled();
    expect(aiCreate()).toBeUndefined();
    expect(m.evaluate).toHaveBeenCalledTimes(1);
  });

  it("never throws into the request", async () => {
    m.prisma.organization.findUnique.mockRejectedValue(new Error("db down"));
    expect((await run()).reason).toBe("error");
  });

  it("requestHuman is idempotent and tenant-scoped", async () => {
    m.prisma.ticket.findFirst.mockResolvedValue({ id: "t1", tags: [] });
    m.prisma.ticketMessage.create.mockResolvedValue({ id: "s1", ticketId: "t1", authorType: "system", body: "x" });
    expect(await aiReplyService.requestHuman("o1", "cust1", "t1")).toEqual({ alreadyRequested: false });
    expect(m.prisma.ticket.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t1", orgId: "o1", customerId: "cust1" } }));

    m.prisma.ticket.findFirst.mockResolvedValue({ id: "t1", tags: ["human-handoff"] });
    expect(await aiReplyService.requestHuman("o1", "cust1", "t1")).toEqual({ alreadyRequested: true });

    m.prisma.ticket.findFirst.mockResolvedValue(null);
    expect(await aiReplyService.requestHuman("o2", "cust1", "t1")).toBeNull();
  });
});
