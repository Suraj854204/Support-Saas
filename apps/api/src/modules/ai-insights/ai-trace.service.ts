import type { Prisma } from "@prisma/client";

import { FALLBACK_REPLY_PREFIX } from "./fallback";

import type { SuggestReplyResult, TicketMessageForAi } from "@/lib/ai-client";
import { AppError } from "@/lib/app-error";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const MAX_QUERY_CHARS = 2_000;
const MAX_REPLY_CHARS = 4_000;
/** Replies below this confidence are surfaced as "needs attention" in the dashboard. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** Same rule the AI service uses to pick its retrieval query: the latest customer message. */
export function latestCustomerMessage(messages: TicketMessageForAi[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.author_type === "customer") return m.body.trim();
  }
  return (messages[messages.length - 1]?.body ?? "").trim();
}

export interface ListTracesQuery {
  page: number;
  pageSize: number;
  feedback?: "up" | "down" | "none";
  fallbackOnly?: boolean;
  lowConfidenceOnly?: boolean;
}

export const aiTraceService = {
  /**
   * Stores why the AI said what it said: the question, the answer, which
   * knowledge-base articles backed it (with similarity), confidence, latency.
   * Returns the trace id so the UI can attach thumbs up/down to it. Never
   * throws — tracing must not be able to break the reply suggestion itself.
   */
  async record(input: {
    orgId: string;
    ticketId?: string;
    userId?: string;
    source?: "ticket_suggest" | "eval";
    messages: TicketMessageForAi[];
    result: SuggestReplyResult;
    latencyMs: number;
  }): Promise<string | undefined> {
    try {
      const trace = await prisma.aiTrace.create({
        data: {
          orgId: input.orgId,
          ticketId: input.ticketId ?? null,
          userId: input.userId ?? null,
          source: input.source ?? "ticket_suggest",
          query: latestCustomerMessage(input.messages).slice(0, MAX_QUERY_CHARS),
          messageCount: input.messages.length,
          reply: input.result.suggested_reply.slice(0, MAX_REPLY_CHARS),
          confidence: input.result.confidence,
          sourceArticles: input.result.source_articles as unknown as Prisma.InputJsonValue,
          latencyMs: Math.max(0, Math.round(input.latencyMs)),
        },
        select: { id: true },
      });
      return trace.id;
    } catch (err) {
      logger.warn({ err }, "Failed to record AI trace (best-effort, continuing)");
      return undefined;
    }
  },

  async list(orgId: string, query: ListTracesQuery) {
    const where: Prisma.AiTraceWhereInput = {
      orgId,
      ...(query.feedback === "up" && { feedback: "up" }),
      ...(query.feedback === "down" && { feedback: "down" }),
      ...(query.feedback === "none" && { feedback: null }),
      ...(query.fallbackOnly && { reply: { startsWith: FALLBACK_REPLY_PREFIX, mode: "insensitive" } }),
      ...(query.lowConfidenceOnly && { confidence: { lt: LOW_CONFIDENCE_THRESHOLD } }),
    };

    const [items, totalItems] = await prisma.$transaction([
      prisma.aiTrace.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.aiTrace.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
      },
    };
  },

  async getById(orgId: string, id: string) {
    const trace = await prisma.aiTrace.findFirst({ where: { id, orgId } });
    if (!trace) throw AppError.notFound("AI trace not found");
    return trace;
  },

  async setFeedback(orgId: string, id: string, feedback: "up" | "down", note?: string) {
    const result = await prisma.aiTrace.updateMany({
      where: { id, orgId },
      data: { feedback, feedbackNote: note ?? null, feedbackAt: new Date() },
    });
    if (result.count !== 1) throw AppError.notFound("AI trace not found");
    return { id, feedback };
  },

  async stats(orgId: string, days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const where: Prisma.AiTraceWhereInput = { orgId, createdAt: { gte: since }, source: "ticket_suggest" };

    const [total, up, down, fallbackCount, lowConfidenceCount, averages] = await Promise.all([
      prisma.aiTrace.count({ where }),
      prisma.aiTrace.count({ where: { ...where, feedback: "up" } }),
      prisma.aiTrace.count({ where: { ...where, feedback: "down" } }),
      prisma.aiTrace.count({ where: { ...where, reply: { startsWith: FALLBACK_REPLY_PREFIX, mode: "insensitive" } } }),
      prisma.aiTrace.count({ where: { ...where, confidence: { lt: LOW_CONFIDENCE_THRESHOLD } } }),
      prisma.aiTrace.aggregate({ where, _avg: { confidence: true, latencyMs: true } }),
    ]);

    const rated = up + down;

    return {
      days,
      total,
      rated,
      up,
      down,
      satisfactionRate: rated > 0 ? up / rated : null,
      fallbackCount,
      fallbackRate: total > 0 ? fallbackCount / total : null,
      lowConfidenceCount,
      avgConfidence: averages._avg.confidence ?? null,
      avgLatencyMs: averages._avg.latencyMs !== null ? Math.round(averages._avg.latencyMs ?? 0) : null,
    };
  },
};

