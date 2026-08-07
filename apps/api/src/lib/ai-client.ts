import { env } from "@/config/env";
import { logger } from "@/lib/logger";

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

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

  async deleteArticle(articleId: string) {
    const res = await fetch(`${BASE_URL}/ai/index/article/${articleId}`, { method: "DELETE" });
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

  async suggestReply(params: { orgId: string; ticketId: string; messages: TicketMessageForAi[] }) {
    return post<SuggestReplyResult>("/ai/suggest-reply", {
      org_id: params.orgId,
      ticket_id: params.ticketId,
      messages: params.messages,
    });
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
