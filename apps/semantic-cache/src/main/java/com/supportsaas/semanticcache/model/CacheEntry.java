package com.supportsaas.semanticcache.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * A stored answer plus the identity it was generated under.
 *
 * Mutable on purpose: hitCount and lastAccessedAt are updated in place on an L1 hit, under the
 * LRU's lock. Everything else is written once at store time.
 *
 * The customer's question is kept (normalised and original) because the semantic path needs it
 * for the optional judge and for operators debugging a bad match. It is never logged and never
 * returned by the stats endpoints.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class CacheEntry {

    private String cacheId;
    private String orgId;
    private String compatibilityKey;

    private String normalizedQuery;
    private String originalQuery;
    private float[] embedding;

    private String response;

    private String model;
    private String modelVersion;
    private String promptVersion;
    private String kbVersion;
    private String retrievalConfigHash;
    private String generationConfigHash;
    private String toolContextHash;
    private String language;

    private long createdAt;
    private long expiresAt;
    private long lastAccessedAt;
    private long hitCount;

    private Integer tokenUsage;

    public CacheEntry() {
    }

    public boolean isExpired(long nowMillis) {
        return expiresAt > 0 && nowMillis >= expiresAt;
    }

    public void recordHit(long nowMillis) {
        hitCount++;
        lastAccessedAt = nowMillis;
    }

    public String getCacheId() {
        return cacheId;
    }

    public void setCacheId(String cacheId) {
        this.cacheId = cacheId;
    }

    public String getOrgId() {
        return orgId;
    }

    public void setOrgId(String orgId) {
        this.orgId = orgId;
    }

    public String getCompatibilityKey() {
        return compatibilityKey;
    }

    public void setCompatibilityKey(String compatibilityKey) {
        this.compatibilityKey = compatibilityKey;
    }

    public String getNormalizedQuery() {
        return normalizedQuery;
    }

    public void setNormalizedQuery(String normalizedQuery) {
        this.normalizedQuery = normalizedQuery;
    }

    public String getOriginalQuery() {
        return originalQuery;
    }

    public void setOriginalQuery(String originalQuery) {
        this.originalQuery = originalQuery;
    }

    public float[] getEmbedding() {
        return embedding;
    }

    public void setEmbedding(float[] embedding) {
        this.embedding = embedding;
    }

    public String getResponse() {
        return response;
    }

    public void setResponse(String response) {
        this.response = response;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getModelVersion() {
        return modelVersion;
    }

    public void setModelVersion(String modelVersion) {
        this.modelVersion = modelVersion;
    }

    public String getPromptVersion() {
        return promptVersion;
    }

    public void setPromptVersion(String promptVersion) {
        this.promptVersion = promptVersion;
    }

    public String getKbVersion() {
        return kbVersion;
    }

    public void setKbVersion(String kbVersion) {
        this.kbVersion = kbVersion;
    }

    public String getRetrievalConfigHash() {
        return retrievalConfigHash;
    }

    public void setRetrievalConfigHash(String retrievalConfigHash) {
        this.retrievalConfigHash = retrievalConfigHash;
    }

    public String getGenerationConfigHash() {
        return generationConfigHash;
    }

    public void setGenerationConfigHash(String generationConfigHash) {
        this.generationConfigHash = generationConfigHash;
    }

    public String getToolContextHash() {
        return toolContextHash;
    }

    public void setToolContextHash(String toolContextHash) {
        this.toolContextHash = toolContextHash;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(long createdAt) {
        this.createdAt = createdAt;
    }

    public long getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(long expiresAt) {
        this.expiresAt = expiresAt;
    }

    public long getLastAccessedAt() {
        return lastAccessedAt;
    }

    public void setLastAccessedAt(long lastAccessedAt) {
        this.lastAccessedAt = lastAccessedAt;
    }

    public long getHitCount() {
        return hitCount;
    }

    public void setHitCount(long hitCount) {
        this.hitCount = hitCount;
    }

    public Integer getTokenUsage() {
        return tokenUsage;
    }

    public void setTokenUsage(Integer tokenUsage) {
        this.tokenUsage = tokenUsage;
    }
}
