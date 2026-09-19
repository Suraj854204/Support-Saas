package com.supportsaas.semanticcache.service;

import com.supportsaas.semanticcache.model.CacheEntry;
import com.supportsaas.semanticcache.model.CacheIdentity;

/**
 * Gate between "these two questions look alike" and "this answer may be reused".
 *
 * Similarity on its own is not enough. "What is your refund policy?" and "What is your refund
 * policy for enterprise customers?" sit well above any usable threshold and want different
 * answers, and an answer generated under an older prompt or an older knowledge base can be
 * confidently wrong. Everything except the question text therefore has to match exactly before
 * a candidate is eligible, which is what compatibilityKey encodes.
 *
 * orgId is compared separately even though it is already folded into that key. It is the one
 * check where a bug leaks another tenant's support conversation, so it gets its own line.
 */
final class CompatibilityChecker {

    /** Null when the entry may be reused; otherwise the reason it was rejected. */
    static String reject(CacheEntry entry, CacheIdentity identity, long nowMillis) {
        if (entry == null) {
            return "NOT_FOUND";
        }
        if (!identity.orgId().equals(entry.getOrgId())) {
            return "TENANT_MISMATCH";
        }
        if (entry.isExpired(nowMillis)) {
            return "EXPIRED";
        }
        if (!identity.compatibilityKey().equals(entry.getCompatibilityKey())) {
            return "CONTEXT_MISMATCH";
        }
        return null;
    }

    private CompatibilityChecker() {
    }
}
