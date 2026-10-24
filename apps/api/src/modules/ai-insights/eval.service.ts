import type { Prisma } from "@prisma/client";

import { scoreCase } from "./eval.scoring";

import { aiClient, type SourceArticle } from "@/lib/ai-client";
import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const MAX_CASES_PER_ORG = 200;
/** An eval run makes one LLM call per case, so a single run is bounded. */
export const MAX_CASES_PER_RUN = 50;
const RUN_CONCURRENCY = 3;
const MAX_REPLY_CHARS_STORED = 800;

/** One run at a time per org: runs cost real LLM calls, so double-clicks must not double the bill. */
const runningOrgs = new Set<string>();

export interface EvalCaseResult {
  caseId: string;
  question: string;
  passed: boolean;
  reasons: string[];
  reply: string;
  confidence: number;
  latencyMs: number;
  sources: SourceArticle[];
}

export interface EvalCaseInput {
  question: string;
  expectedKeywords: string[];
  forbiddenKeywords: string[];
  expectFallback: boolean;
}

function cleanKeywords(list: string[]): string[] {
  return Array.from(new Set(list.map((k) => k.trim()).filter(Boolean)));
}

export const evalService = {
  listCases(orgId: string) {
    return prisma.evalCase.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  },

  async createCase(orgId: string, userId: string, input: EvalCaseInput) {
    const count = await prisma.evalCase.count({ where: { orgId } });
    if (count >= MAX_CASES_PER_ORG) throw AppError.validation(`You can have at most ${MAX_CASES_PER_ORG} eval cases`);

    return prisma.evalCase.create({
      data: {
        orgId,
        createdById: userId,
        question: input.question,
        expectedKeywords: cleanKeywords(input.expectedKeywords),
        forbiddenKeywords: cleanKeywords(input.forbiddenKeywords),
        expectFallback: input.expectFallback,
      },
    });
  },

  async updateCase(orgId: string, id: string, input: Partial<EvalCaseInput>) {
    const result = await prisma.evalCase.updateMany({
      where: { id, orgId },
      data: {
        ...(input.question !== undefined && { question: input.question }),
        ...(input.expectedKeywords && { expectedKeywords: cleanKeywords(input.expectedKeywords) }),
        ...(input.forbiddenKeywords && { forbiddenKeywords: cleanKeywords(input.forbiddenKeywords) }),
        ...(input.expectFallback !== undefined && { expectFallback: input.expectFallback }),
      },
    });
    if (result.count !== 1) throw AppError.notFound("Eval case not found");
    return prisma.evalCase.findFirstOrThrow({ where: { id, orgId } });
  },

  async deleteCase(orgId: string, id: string) {
    const result = await prisma.evalCase.deleteMany({ where: { id, orgId } });
    if (result.count !== 1) throw AppError.notFound("Eval case not found");
  },

  /**
   * Runs every saved question through the live AI pipeline (same retrieval,
   * same prompt, same semantic cache as a real agent request) and scores the
   * replies. Run it before and after editing knowledge-base articles or the
   * prompt to see what got better and what regressed.
   */
  async run(orgId: string, userId: string) {
    if (runningOrgs.has(orgId)) throw AppError.conflict("An eval run is already in progress for your organization");

    const cases = await prisma.evalCase.findMany({ where: { orgId }, orderBy: { createdAt: "asc" }, take: MAX_CASES_PER_RUN });
    if (cases.length === 0) throw AppError.validation("Add at least one eval case before running an evaluation");

    runningOrgs.add(orgId);
    try {
      const results: EvalCaseResult[] = [];

      for (let i = 0; i < cases.length; i += RUN_CONCURRENCY) {
        const chunk = cases.slice(i, i + RUN_CONCURRENCY);

        const chunkResults = await Promise.all(
          chunk.map(async (c): Promise<EvalCaseResult> => {
            const startedAt = Date.now();
            try {
              const answer = await aiClient.suggestReplyUntraced({
                orgId,
                ticketId: `eval-${c.id}`,
                messages: [{ author_type: "customer", body: c.question }],
              });
              const verdict = scoreCase(c, answer.suggested_reply);

              return {
                caseId: c.id,
                question: c.question,
                passed: verdict.passed,
                reasons: verdict.reasons,
                reply: answer.suggested_reply.slice(0, MAX_REPLY_CHARS_STORED),
                confidence: answer.confidence,
                latencyMs: Date.now() - startedAt,
                sources: answer.source_articles,
              };
            } catch (err) {
              logger.warn({ err, caseId: c.id }, "Eval case failed to run");
              return {
                caseId: c.id,
                question: c.question,
                passed: false,
                reasons: [`AI service error: ${err instanceof Error ? err.message : "unknown error"}`],
                reply: "",
                confidence: 0,
                latencyMs: Date.now() - startedAt,
                sources: [],
              };
            }
          })
        );

        results.push(...chunkResults);
      }

      const passed = results.filter((r) => r.passed).length;
      const avg = (pick: (r: EvalCaseResult) => number) =>
        results.length ? results.reduce((sum, r) => sum + pick(r), 0) / results.length : 0;

      const run = await prisma.evalRun.create({
        data: {
          orgId,
          startedById: userId,
          total: results.length,
          passed,
          avgConfidence: avg((r) => r.confidence),
          avgLatencyMs: Math.round(avg((r) => r.latencyMs)),
          results: results as unknown as Prisma.InputJsonValue,
        },
      });

      await recordAudit({
        orgId,
        actorId: userId,
        action: "ai_eval.run",
        targetType: "eval_run",
        targetId: run.id,
        metadata: { total: run.total, passed: run.passed },
      });

      return run;
    } finally {
      runningOrgs.delete(orgId);
    }
  },

  /** Newest first, without the bulky per-case results. */
  listRuns(orgId: string) {
    return prisma.evalRun.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, total: true, passed: true, avgConfidence: true, avgLatencyMs: true, createdAt: true, startedById: true },
    });
  },

  async getRun(orgId: string, id: string) {
    const run = await prisma.evalRun.findFirst({ where: { id, orgId } });
    if (!run) throw AppError.notFound("Eval run not found");
    return run;
  },
};
