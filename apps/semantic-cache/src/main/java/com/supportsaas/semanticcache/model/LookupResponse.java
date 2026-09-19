package com.supportsaas.semanticcache.model;

/**
 * hit=true means the caller can skip retrieval and generation entirely.
 *
 * On a miss, leaseId is non-null for the request that owns the downstream RAG/LLM execution and
 * null for a caller that was told to proceed without a slot. Either way the caller runs the
 * normal pipeline — the cache never blocks it.
 */
public record LookupResponse(
        boolean hit,
        String matchType,
        Double similarity,
        String response,
        String reason,
        String leaseId,
        JudgeCandidate judgeCandidate) {

    public static LookupResponse exactHit(String response) {
        return new LookupResponse(true, "EXACT", 1.0, response, null, null, null);
    }

    public static LookupResponse semanticHit(String response, double similarity) {
        return new LookupResponse(true, "SEMANTIC", similarity, response, null, null, null);
    }

    public static LookupResponse coalescedHit(String response) {
        return new LookupResponse(true, "COALESCED", null, response, null, null, null);
    }

    public static LookupResponse miss(String reason, String leaseId) {
        return new LookupResponse(false, null, null, null, reason, leaseId, null);
    }

    public static LookupResponse needsJudge(JudgeCandidate candidate, String leaseId) {
        return new LookupResponse(false, null, candidate.similarity(), null, "JUDGE_REQUIRED", leaseId, candidate);
    }
}
