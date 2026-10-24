import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  aiTrace: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    aggregate: vi.fn(),
  },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { aiTraceService, latestCustomerMessage } from "../ai-trace.service";

const result = {
  suggested_reply: "Refunds take 7 days.",
  confidence: 0.82,
  source_articles: [{ article_id: "a1", title: "Refund policy", similarity: 0.91 }],
};

beforeEach(() => vi.clearAllMocks());

describe("latestCustomerMessage", () => {
  it("picks the most recent customer message, like the AI service's retrieval query", () => {
    expect(
      latestCustomerMessage([
        { author_type: "customer", body: "first" },
        { author_type: "agent", body: "reply" },
        { author_type: "customer", body: "  second  " },
        { author_type: "agent", body: "another reply" },
      ])
    ).toBe("second");
  });

  it("falls back to the last message when no customer wrote, and to empty for none", () => {
    expect(latestCustomerMessage([{ author_type: "agent", body: "hello" }])).toBe("hello");
    expect(latestCustomerMessage([])).toBe("");
  });
});

describe("aiTraceService.record", () => {
  it("stores the question, answer, sources, confidence and latency under the org", async () => {
    prismaMock.aiTrace.create.mockResolvedValue({ id: "tr1" });

    const id = await aiTraceService.record({
      orgId: "org1",
      ticketId: "t1",
      messages: [{ author_type: "customer", body: "How long do refunds take?" }],
      result,
      latencyMs: 1234.6,
    });

    expect(id).toBe("tr1");
    const data = (prismaMock.aiTrace.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({
      orgId: "org1",
      ticketId: "t1",
      source: "ticket_suggest",
      query: "How long do refunds take?",
      messageCount: 1,
      reply: "Refunds take 7 days.",
      confidence: 0.82,
      latencyMs: 1235,
    });
    expect(data.sourceArticles).toEqual(result.source_articles);
  });

  it("truncates oversized text instead of failing the insert", async () => {
    prismaMock.aiTrace.create.mockResolvedValue({ id: "tr1" });

    await aiTraceService.record({
      orgId: "org1",
      messages: [{ author_type: "customer", body: "q".repeat(50_000) }],
      result: { ...result, suggested_reply: "r".repeat(50_000) },
      latencyMs: 1,
    });

    const data = (prismaMock.aiTrace.create.mock.calls[0]?.[0] as { data: { query: string; reply: string } }).data;
    expect(data.query.length).toBeLessThanOrEqual(2000);
    expect(data.reply.length).toBeLessThanOrEqual(4000);
  });

  it("never throws — a tracing failure must not break the AI suggestion", async () => {
    prismaMock.aiTrace.create.mockRejectedValue(new Error("db down"));

    await expect(
      aiTraceService.record({ orgId: "org1", messages: [], result, latencyMs: 5 })
    ).resolves.toBeUndefined();
  });
});

describe("aiTraceService tenant isolation", () => {
  it("getById only finds traces in the caller's org", async () => {
    prismaMock.aiTrace.findFirst.mockResolvedValue(null);

    await expect(aiTraceService.getById("org1", "foreign")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.aiTrace.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", orgId: "org1" } });
  });

  it("feedback on another org's trace is a 404 and writes nothing for that org", async () => {
    prismaMock.aiTrace.updateMany.mockResolvedValue({ count: 0 });

    await expect(aiTraceService.setFeedback("org1", "foreign", "down")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.aiTrace.updateMany).toHaveBeenCalledWith({
      where: { id: "foreign", orgId: "org1" },
      data: expect.objectContaining({ feedback: "down" }),
    });
  });

  it("list always filters by org and applies the requested filters", async () => {
    prismaMock.aiTrace.findMany.mockResolvedValue([]);
    prismaMock.aiTrace.count.mockResolvedValue(0);

    await aiTraceService.list("org1", { page: 1, pageSize: 25, feedback: "down", lowConfidenceOnly: true });

    const where = (prismaMock.aiTrace.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ orgId: "org1", feedback: "down", confidence: { lt: 0.6 } });
  });
});

describe("aiTraceService.stats", () => {
  it("computes satisfaction, fallback rate and averages from counts", async () => {
    // Order matches the service: total, up, down, fallback, lowConfidence
    prismaMock.aiTrace.count
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(15);
    prismaMock.aiTrace.aggregate.mockResolvedValue({ _avg: { confidence: 0.71, latencyMs: 1500.4 } });

    const stats = await aiTraceService.stats("org1", 7);

    expect(stats).toMatchObject({
      days: 7,
      total: 100,
      rated: 40,
      satisfactionRate: 0.75,
      fallbackRate: 0.2,
      lowConfidenceCount: 15,
      avgConfidence: 0.71,
      avgLatencyMs: 1500,
    });
  });

  it("returns null rates instead of dividing by zero when there is no data", async () => {
    prismaMock.aiTrace.count.mockResolvedValue(0);
    prismaMock.aiTrace.aggregate.mockResolvedValue({ _avg: { confidence: null, latencyMs: null } });

    const stats = await aiTraceService.stats("org1", 7);

    expect(stats.satisfactionRate).toBeNull();
    expect(stats.fallbackRate).toBeNull();
    expect(stats.avgConfidence).toBeNull();
    expect(stats.avgLatencyMs).toBeNull();
  });
});
