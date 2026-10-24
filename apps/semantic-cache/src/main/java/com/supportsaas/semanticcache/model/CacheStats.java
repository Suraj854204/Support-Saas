package com.supportsaas.semanticcache.model;

/**
 * Operational counters only. No cached content, no customer text — this is safe to show to an
 * admin in the dashboard.
 *
 * estimatedCostAvoided is llmCallsAvoided multiplied by the configured cost per call, and stays
 * at zero until someone configures a real price for their provider.
 */
public record CacheStats(
        long requests,
        long hits,
        long misses,
        long exactHits,
        long semanticHits,
        long coalescedHits,
        long rejections,
        long bloomRejections,
        long llmCallsAvoided,
        double hitRate,
        double averageSimilarity,
        int entryCount,
        int capacity,
        long evictions,
        int inFlightRequests,
        int queueDepth,
        long estimatedTokensAvoided,
        double estimatedCostAvoided) {
}
