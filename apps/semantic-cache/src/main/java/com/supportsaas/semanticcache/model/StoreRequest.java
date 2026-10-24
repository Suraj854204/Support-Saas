package com.supportsaas.semanticcache.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

/** Store payload. leaseId comes from the lookup that reported the miss, and releases the coalescing slot. */
public record StoreRequest(
        @NotBlank String orgId,
        @NotBlank String query,
        @NotEmpty float[] embedding,
        @NotBlank String response,
        String model,
        String modelVersion,
        String promptVersion,
        String kbVersion,
        String retrievalConfigHash,
        String generationConfigHash,
        String toolContextHash,
        String language,
        Integer tokenUsage,
        String leaseId) {
}
