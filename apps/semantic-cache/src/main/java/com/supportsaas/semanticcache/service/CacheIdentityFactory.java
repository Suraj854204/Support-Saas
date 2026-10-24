package com.supportsaas.semanticcache.service;

import com.supportsaas.semanticcache.model.CacheIdentity;
import com.supportsaas.semanticcache.model.LookupRequest;
import com.supportsaas.semanticcache.model.StoreRequest;
import com.supportsaas.semanticcache.similarity.QueryNormalizer;
import org.springframework.stereotype.Component;

/**
 * Turns a request into a {@link CacheIdentity}.
 *
 * Null context fields become empty strings rather than being skipped, so a caller that omits a
 * field produces a different key from one that sends a value — omission is never silently
 * treated as a match. kbVersion is resolved from the registry when the caller does not pin one.
 */
@Component
public class CacheIdentityFactory {

    private final KbVersionRegistry kbVersions;

    public CacheIdentityFactory(KbVersionRegistry kbVersions) {
        this.kbVersions = kbVersions;
    }

    public CacheIdentity from(LookupRequest request) {
        return build(request.orgId(), request.query(), request.model(), request.modelVersion(),
                request.promptVersion(), request.kbVersion(), request.retrievalConfigHash(),
                request.generationConfigHash(), request.toolContextHash(), request.language());
    }

    public CacheIdentity from(StoreRequest request) {
        return build(request.orgId(), request.query(), request.model(), request.modelVersion(),
                request.promptVersion(), request.kbVersion(), request.retrievalConfigHash(),
                request.generationConfigHash(), request.toolContextHash(), request.language());
    }

    private CacheIdentity build(String orgId, String query, String model, String modelVersion,
                                String promptVersion, String kbVersion, String retrievalConfigHash,
                                String generationConfigHash, String toolContextHash, String language) {
        return new CacheIdentity(
                orgId,
                QueryNormalizer.normalize(query),
                defaulted(model),
                defaulted(modelVersion),
                defaulted(promptVersion),
                kbVersion != null && !kbVersion.isBlank() ? kbVersion : kbVersions.currentVersion(orgId),
                defaulted(retrievalConfigHash),
                defaulted(generationConfigHash),
                defaulted(toolContextHash),
                defaulted(language));
    }

    private static String defaulted(String value) {
        return value == null ? "" : value;
    }
}
