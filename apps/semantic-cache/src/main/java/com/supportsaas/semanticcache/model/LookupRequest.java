package com.supportsaas.semanticcache.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

/**
 * Lookup payload from the AI service. The embedding is supplied by the caller — this service
 * deliberately has no embedding provider of its own, so there is exactly one embedding model in
 * the platform and no risk of the cache and the retriever disagreeing about vector space.
 *
 * kbVersion is optional: when the caller leaves it out we stamp the org's current version from
 * the registry, which is what the knowledge-base invalidation path bumps.
 */
public record LookupRequest(
        @NotBlank String orgId,
        @NotBlank String query,
        @NotEmpty float[] embedding,
        String model,
        String modelVersion,
        String promptVersion,
        String kbVersion,
        String retrievalConfigHash,
        String generationConfigHash,
        String toolContextHash,
        String language,
        Integer priority) {
}
