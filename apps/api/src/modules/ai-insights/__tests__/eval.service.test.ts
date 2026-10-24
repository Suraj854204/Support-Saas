import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    evalCase: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirstOrThrow: vi.fn() },
    evalRun: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  suggest: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/ai-client", () => ({ aiClient: { suggestReplyUntraced: mocks.suggest } }));

import { evalService } from "../eval.service";

const FALLBACK = "I'm sorry, but I couldn't find this information in our knowledge base. Please contact a human support agent.";

function evalCase(id: string, over: Record<string, unknown> = {}) {
  return { id, question: `question ${id}`, expectedKeywords: [], forbiddenKeywords: [], expectFallback: false, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.auditLog.create.mockResolvedValue({});
  mocks.prisma.evalRun.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "run1", ...data }));
});

describe("evalService.run", () => {
  it("scores each case against the live pipeline and stores aggregates", async () => {
    mocks.prisma.evalCase.findMany.mockResolvedValue([
      evalCase("c1", { expectedKeywords: ["7 days"] }),
      evalCase("c2", { expectedKeywords: ["refund"] }),
      evalCase("c3", { expectFallback: true }),
    ]);
    mocks.suggest
      .mockResolvedValueOnce({ suggested_reply: "Refunds take 7 days.", confidence: 0.8, source_articles: [] })
      .mockResolvedValueOnce({ suggested_reply: "Please wait.", confidence: 0.4, source_articles: [] }) // misses "refund"
      .mockResolvedValueOnce({ suggested_reply: FALLBACK, confidence: 0, source_articles: [] });

    const run = await evalService.run("org1", "u1");

    expect(run).toMatchObject({ total: 3, passed: 2, orgId: "org1" });
    const results = (run as unknown as { results: Array<{ caseId: string; passed: boolean; reasons: string[] }> }).results;
    expect(results.map((r) => r.passed)).toEqual([true, false, true]);
    expect(results[1]?.reasons[0]).toContain('"refund"');
    expect((run as unknown as { avgConfidence: number }).avgConfidence).toBeCloseTo(0.4, 5);
  });

  it("only runs the caller's own cases", async () => {
    mocks.prisma.evalCase.findMany.mockResolvedValue([evalCase("c1")]);
    mocks.suggest.mockResolvedValue({ suggested_reply: "ok", confidence: 1, source_articles: [] });

    await evalService.run("org1", "u1");

    expect(mocks.prisma.evalCase.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "org1" } }));
    expect(mocks.suggest).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org1" }));
  });

  it("records an AI-service failure as a failed case instead of aborting the whole run", async () => {
    mocks.prisma.evalCase.findMany.mockResolvedValue([evalCase("c1"), evalCase("c2")]);
    mocks.suggest
      .mockRejectedValueOnce(new Error("Suggestion failed: quota"))
      .mockResolvedValueOnce({ suggested_reply: "fine", confidence: 0.9, source_articles: [] });

    const run = await evalService.run("org1", "u1");

    expect(run).toMatchObject({ total: 2, passed: 1 });
    const results = (run as unknown as { results: Array<{ reasons: string[] }> }).results;
    expect(results[0]?.reasons[0]).toContain("AI service error: Suggestion failed: quota");
  });

  it("refuses to run with no cases", async () => {
    mocks.prisma.evalCase.findMany.mockResolvedValue([]);

    await expect(evalService.run("org1", "u1")).rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.suggest).not.toHaveBeenCalled();
  });

  it("allows only one run at a time per org, and frees the slot afterwards (even on failure)", async () => {
    mocks.prisma.evalCase.findMany.mockResolvedValue([evalCase("c1")]);

    let release: (v: unknown) => void = () => undefined;
    mocks.suggest.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));

    const first = evalService.run("org1", "u1");
    await vi.waitFor(() => expect(mocks.suggest).toHaveBeenCalledTimes(1));

    await expect(evalService.run("org1", "u2")).rejects.toMatchObject({ statusCode: 409 });
    // A different org is unaffected.
    mocks.suggest.mockResolvedValueOnce({ suggested_reply: "ok", confidence: 1, source_articles: [] });
    await expect(evalService.run("org2", "u3")).resolves.toBeDefined();

    release({ suggested_reply: "ok", confidence: 1, source_articles: [] });
    await first;

    mocks.suggest.mockResolvedValueOnce({ suggested_reply: "ok", confidence: 1, source_articles: [] });
    await expect(evalService.run("org1", "u1")).resolves.toBeDefined();
  });

  it("bounds a single run so one click cannot trigger hundreds of LLM calls", async () => {
    mocks.prisma.evalCase.findMany.mockResolvedValue([evalCase("c1")]);
    mocks.suggest.mockResolvedValue({ suggested_reply: "ok", confidence: 1, source_articles: [] });

    await evalService.run("org1", "u1");

    expect(mocks.prisma.evalCase.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });
});

describe("evalService case management", () => {
  it("dedupes and trims keywords on create", async () => {
    mocks.prisma.evalCase.count.mockResolvedValue(0);
    mocks.prisma.evalCase.create.mockImplementation(async ({ data }: { data: unknown }) => data);

    await evalService.createCase("org1", "u1", {
      question: "How long do refunds take?",
      expectedKeywords: [" 7 days ", "7 days", "", "refund"],
      forbiddenKeywords: [],
      expectFallback: false,
    });

    const data = (mocks.prisma.evalCase.create.mock.calls[0]?.[0] as { data: { expectedKeywords: string[] } }).data;
    expect(data.expectedKeywords).toEqual(["7 days", "refund"]);
  });

  it("cannot update or delete another org's case", async () => {
    mocks.prisma.evalCase.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.evalCase.deleteMany.mockResolvedValue({ count: 0 });

    await expect(evalService.updateCase("org1", "foreign", { question: "x y z" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(evalService.deleteCase("org1", "foreign")).rejects.toMatchObject({ statusCode: 404 });

    expect(mocks.prisma.evalCase.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "foreign", orgId: "org1" } }));
    expect(mocks.prisma.evalCase.deleteMany).toHaveBeenCalledWith({ where: { id: "foreign", orgId: "org1" } });
  });

  it("cannot read another org's run", async () => {
    mocks.prisma.evalRun.findFirst.mockResolvedValue(null);

    await expect(evalService.getRun("org1", "foreign")).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.prisma.evalRun.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", orgId: "org1" } });
  });
});
