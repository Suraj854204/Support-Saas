package com.supportsaas.semanticcache.model;

/**
 * A borderline semantic match: similar enough to be worth a second opinion, not similar enough
 * to reuse on similarity alone. Returned to the caller so it can run a cheap judge with the
 * model it already has configured, rather than this service growing an LLM client of its own.
 */
public record JudgeCandidate(double similarity, String query, String response) {
}
