import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { aiTraceService } from "@/modules/ai-insights/ai-trace.service";

const BASE_URL = env.AI_SERVICE_URL;

class AiServiceError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}

/** Service-to-service auth + a hard timeout on every call to the AI service. */
function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return env.AI_SERVICE_TOKEN ? { ...extra, "X-Internal-Token": env.AI_SERVICE_TOKEN } : extra;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: internalHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(env.AI_SERVICE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = (await res.json().catch(() => ({ detail: res.statusText }))) as { detail?: string };
    throw new AiServiceError(detail.detail ?? "AI service request failed", res.status);
  }

  return res.json() as Promise<T>;
}

export interface TicketMessageForAi {
  author_type: "customer" | "agent" | "ai" | "system";
  body: string;
}

export interface SummarizeResult {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
}

export interface SourceArticle {
  article_id: string;
  title: string;
  similarity: number;
}

export interface SuggestReplyResult {
  suggested_reply: string;
  confidence: number;
  source_articles: SourceArticle[];
  /** Added by the API (not the AI service) when the suggestion was traced. */
  trace_id?: string;
}

export const aiClient = {
  async indexArticle(params: { orgId: string; articleId: string; title: string; content: string; tags: string[] }) {
    return post<{ article_id: string; chunks_indexed: number }>("/ai/index/article", {
      org_id: params.orgId,
      article_id: params.articleId,
      title: params.title,
      content: params.content,
      tags: params.tags,
    });
  },

  async deleteArticle(articleId: string, orgId?: string) {
    // org_id is optional so older callers keep working; when present the AI
    // service can also invalidate that org's semantic cache entries.
    const query = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
    const res = await fetch(`${BASE_URL}/ai/index/article/${articleId}${query}`, {
      method: "DELETE",
      headers: internalHeaders(),
      signal: AbortSignal.timeout(env.AI_SERVICE_TIMEOUT_MS),
    });
    if (!res.ok) throw new AiServiceError("Failed to delete article from AI index", res.status);
    return res.json();
  },

  async summarizeTicket(params: { orgId: string; ticketId: string; messages: TicketMessageForAi[] }) {
    return post<SummarizeResult>("/ai/summarize", {
      org_id: params.orgId,
      ticket_id: params.ticketId,
      messages: params.messages,
    });
  },

  /** Raw call to the AI service — no tracing. Used by the eval runner, which records its own results. */
  async suggestReplyUntraced(params: { orgId: string; ticketId: string; messages: TicketMessageForAi[] }) {
    const body = { org_id: params.orgId, ticket_id: params.ticketId, messages: params.messages };
    try {
      return await post<SuggestReplyResult>("/ai/suggest-reply", body);
    } catch (err) {
      // One bounded retry, only for transient failures. Suggesting is read-only, so it is safe to repeat.
      const transient = !(err instanceof AiServiceError) || err.status >= 500;
      if (!transient) throw err;
      return post<SuggestReplyResult>("/ai/suggest-reply", body);
    }
  },

  async suggestReply(params: { orgId: string; ticketId: string; messages: TicketMessageForAi[] }) {
    const startedAt = Date.now();
    const result = await aiClient.suggestReplyUntraced(params);

    // Record why the AI answered this way and hand back the trace id so the UI
    // can attach thumbs up/down to it. Best-effort: a tracing failure just
    // means the response has no trace_id; the suggestion itself is unaffected.
    const traceId = await aiTraceService.record({
      orgId: params.orgId,
      ticketId: params.ticketId,
      messages: params.messages,
      result,
      latencyMs: Date.now() - startedAt,
    });

    return traceId ? { ...result, trace_id: traceId } : result;
  },

  /** Fire-and-forget wrapper for calls that should never fail the caller's request. */
  async bestEffort<T>(fn: () => Promise<T>, context: string): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      logger.warn({ err, context }, "AI service call failed (best-effort, continuing)");
      return null;
    }
  },
};

export { AiServiceError };
