package com.supportsaas.semanticcache.model;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Everything that has to match before a stored answer may be reused.
 *
 * The raw question alone is not a cache key. The same words answered by a different model, a
 * different prompt revision, a different knowledge base snapshot or a different retrieval config
 * can produce a legitimately different answer, so all of it is folded into the identity. Nothing
 * here is time-dependent — the key has to be reproducible on the next request.
 *
 * {@link #exactKey()} covers the query too and identifies one specific cached answer.
 * {@link #compatibilityKey()} leaves the query out, and is what a semantic candidate has to
 * agree with before its answer can be handed to a different question.
 */
public record CacheIdentity(
        String orgId,
        String normalizedQuery,
        String model,
        String modelVersion,
        String promptVersion,
        String kbVersion,
        String retrievalConfigHash,
        String generationConfigHash,
        String toolContextHash,
        String language) {

    public String exactKey() {
        return sha256(String.join("\u0000",
                orgId, normalizedQuery, model, modelVersion, promptVersion,
                kbVersion, retrievalConfigHash, generationConfigHash, toolContextHash, language));
    }

    public String compatibilityKey() {
        return sha256(String.join("\u0000",
                orgId, model, modelVersion, promptVersion, kbVersion,
                retrievalConfigHash, generationConfigHash, toolContextHash, language));
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
