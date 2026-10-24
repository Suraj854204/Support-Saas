import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";
import { logger } from "@/lib/logger";

export interface CacheStats {
  totalRequests: number;
  hits: number;
  misses: number;
  exactHits: number;
  semanticHits: number;
  coalescedRequests: number;
  hitRate: number;
  exactHitRate: number;
  semanticHitRate: number;
  llmCallsAvoided: number;
  estimatedTokensAvoided: number;
  estimatedCostAvoided: number;
  averageSimilarity: number;
  entryCount: number;
  evictions: number;
  inFlightRequests: number;
  queueDepth: number;
  bloomRejections: number;
  lookupLatencyP50Ms: number;
  lookupLatencyP95Ms: number;
  lookupLatencyP99Ms: number;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (env.SEMANTIC_CACHE_SERVICE_TOKEN) {
    h["X-Internal-Token"] = env.SEMANTIC_CACHE_SERVICE_TOKEN;
  }
  return h;
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.SEMANTIC_CACHE_URL}${path}`, {
      ...init,
      headers: headers(),
      signal: AbortSignal.timeout(env.SEMANTIC_CACHE_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err, path }, "SemantiCache request failed");
    throw new AppError("INTERNAL_ERROR", "Semantic cache service is unavailable", 503);
  }

  if (!res.ok) {
    throw new AppError("INTERNAL_ERROR", `Semantic cache request failed (${res.status})`, 502);
  }

  return res.json() as Promise<T>;
}

export const semanticCacheService = {
  /**
   * Stats are aggregated per instance. Behind more than one SemantiCache
   * replica this reports whichever instance answered, not a cluster total.
   */
  getStats() {
    return call<CacheStats>("/api/v1/cache/stats", { method: "GET" });
  },

  /** Drops every cached answer for one organization. Scoped by the caller's org. */
  invalidateOrg(orgId: string) {
    return call<{ invalidated: number; kbVersion: string }>("/api/v1/cache/invalidate", {
      method: "POST",
      body: JSON.stringify({ orgId }),
    });
  },
};
