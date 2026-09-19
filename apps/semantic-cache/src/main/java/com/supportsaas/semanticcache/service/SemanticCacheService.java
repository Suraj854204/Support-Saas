package com.supportsaas.semanticcache.service;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

import com.supportsaas.semanticcache.bloom.BloomFilter;
import com.supportsaas.semanticcache.cache.LruCache;
import com.supportsaas.semanticcache.concurrency.RequestCoalescer;
import com.supportsaas.semanticcache.config.CacheProperties;
import com.supportsaas.semanticcache.lsh.LshIndex;
import com.supportsaas.semanticcache.metrics.CacheMetrics;
import com.supportsaas.semanticcache.model.CacheEntry;
import com.supportsaas.semanticcache.model.CacheIdentity;
import com.supportsaas.semanticcache.model.CacheStats;
import com.supportsaas.semanticcache.model.JudgeCandidate;
import com.supportsaas.semanticcache.model.LookupRequest;
import com.supportsaas.semanticcache.model.LookupResponse;
import com.supportsaas.semanticcache.model.StoreRequest;
import com.supportsaas.semanticcache.scheduler.LlmRequestScheduler;
import com.supportsaas.semanticcache.similarity.CosineSimilarity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Lookup and store orchestration.
 *
 * Lookup order, cheapest first:
 *   1. L1 LRU on the exact cache identity
 *   2. Bloom filter — if this instance has definitely never stored the identity, skip the Redis
 *      round trip (see bloomGatesL2 in the README for the multi-instance trade-off)
 *   3. L2 Redis on the same identity, promoted into L1 and the LSH index on a hit
 *   4. LSH candidates, exact cosine on each, threshold and compatibility checks
 *   5. Miss — the caller runs RAG + LLM, and concurrent identical misses are coalesced onto one
 *
 * Nothing here is allowed to be a single point of failure. The controller turns anything
 * unexpected into a miss, and the caller's existing pipeline takes over.
 */
@Service
public class SemanticCacheService {

    private static final Logger log = LoggerFactory.getLogger(SemanticCacheService.class);

    private final CacheProperties properties;
    private final CacheMetrics metrics;
    private final CacheIdentityFactory identities;
    private final RedisCacheStore redis;
    private final KbVersionRegistry kbVersions;

    private final LruCache<String, CacheEntry> l1;
    private final BloomFilter bloom;
    private final LshIndex lshIndex;
    private final RequestCoalescer coalescer;
    private final LlmRequestScheduler scheduler;

    /** Which keys belong to which org, so an org-wide invalidation does not scan the whole LRU. */
    private final Map<String, Set<String>> keysByOrg = new ConcurrentHashMap<>();

    /** Leases that are holding a scheduler slot, so exactly one release happens per grant. */
    private final Map<String, Boolean> leaseHoldsSlot = new ConcurrentHashMap<>();

    public SemanticCacheService(CacheProperties properties, CacheMetrics metrics,
                                CacheIdentityFactory identities, RedisCacheStore redis,
                                KbVersionRegistry kbVersions, LruCache<String, CacheEntry> l1,
                                BloomFilter bloom, LshIndex lshIndex, RequestCoalescer coalescer,
                                LlmRequestScheduler scheduler) {
        this.properties = properties;
        this.metrics = metrics;
        this.identities = identities;
        this.redis = redis;
        this.kbVersions = kbVersions;
        this.l1 = l1;
        this.bloom = bloom;
        this.lshIndex = lshIndex;
        this.coalescer = coalescer;
        this.scheduler = scheduler;

        this.l1.onEviction((key, entry) -> {
            metrics.recordEviction();
            lshIndex.remove(entry.getOrgId(), key);
            forgetOrgKey(entry.getOrgId(), key);
        });
    }

    public CompletableFuture<LookupResponse> lookup(LookupRequest request) {
        if (!properties.isEnabled()) {
            return CompletableFuture.completedFuture(LookupResponse.miss("CACHE_DISABLED", null));
        }

        validateEmbedding(request.embedding());

        long startedAt = System.nanoTime();
        metrics.recordRequest();

        CacheIdentity identity = identities.from(request);
        String key = identity.exactKey();
        long now = System.currentTimeMillis();

        LookupResponse exact = exactLookup(identity, key, now);
        if (exact != null) {
            metrics.recordLookupLatency(System.nanoTime() - startedAt);
            return CompletableFuture.completedFuture(exact);
        }

        SemanticMatch match = semanticLookup(identity, request.embedding(), now);
        if (match != null && match.similarity() >= properties.getSimilarityThreshold()) {
            match.entry().recordHit(now);
            metrics.recordSemanticHit(match.similarity());
            metrics.recordLookupLatency(System.nanoTime() - startedAt);
            return CompletableFuture.completedFuture(
                    LookupResponse.semanticHit(match.entry().getResponse(), match.similarity()));
        }

        metrics.recordMiss();
        metrics.recordLookupLatency(System.nanoTime() - startedAt);

        boolean borderline = properties.isJudgeEnabled() && match != null
                && match.similarity() >= properties.getJudgeThreshold();

        return onMiss(key, request, borderline ? match : null);
    }

    /** L1 then L2, both on the exact identity. Returns null when neither has a usable entry. */
    private LookupResponse exactLookup(CacheIdentity identity, String key, long now) {
        CacheEntry entry = l1.get(key);

        if (entry == null) {
            if (properties.isBloomGatesL2() && !bloom.mightContain(key)) {
                metrics.recordBloomRejection();
                return null;
            }
            entry = redis.get(identity.orgId(), key);
            if (entry != null && CompatibilityChecker.reject(entry, identity, now) == null) {
                promote(key, entry);
            }
        }

        if (entry == null) {
            return null;
        }

        String rejection = CompatibilityChecker.reject(entry, identity, now);
        if (rejection != null) {
            metrics.recordRejection();
            evict(key, entry.getOrgId());
            return null;
        }

        entry.recordHit(now);
        metrics.recordExactHit();
        return LookupResponse.exactHit(entry.getResponse());
    }

    private record SemanticMatch(CacheEntry entry, double similarity) {
    }

    /**
     * LSH narrows the search to a handful of candidates; exact cosine then decides. LSH on its own
     * is approximate — it can miss a true neighbour and it routinely returns unrelated entries —
     * so the score that actually gates reuse is always the exact one computed here.
     */
    private SemanticMatch semanticLookup(CacheIdentity identity, float[] embedding, long now) {
        Set<String> candidates = lshIndex.candidates(identity.orgId(), embedding, properties.getMaxCandidates());
        metrics.recordCandidates(candidates.size());

        CacheEntry best = null;
        double bestScore = -1;

        for (String candidateKey : candidates) {
            CacheEntry candidate = l1.get(candidateKey);

            String rejection = CompatibilityChecker.reject(candidate, identity, now);
            if (rejection != null) {
                if (candidate != null) {
                    metrics.recordRejection();
                    if ("EXPIRED".equals(rejection)) {
                        evict(candidateKey, candidate.getOrgId());
                    }
                }
                continue;
            }

            double score = CosineSimilarity.between(embedding, candidate.getEmbedding());
            if (score > bestScore) {
                bestScore = score;
                best = candidate;
            }
        }

        if (best == null) {
            return null;
        }

        metrics.recordSimilarity(bestScore);
        return new SemanticMatch(best, bestScore);
    }

    /**
     * Either becomes the owner of the downstream execution or waits for the owner that already
     * exists. Waiters that time out or whose owner failed fall through to a plain miss and run
     * the pipeline themselves.
     */
    private CompletableFuture<LookupResponse> onMiss(String key, LookupRequest request, SemanticMatch borderline) {
        RequestCoalescer.Slot slot = coalescer.begin(key);

        if (!slot.owner()) {
            return slot.result()
                    .handle((response, error) -> {
                        if (error != null || response == null) {
                            return LookupResponse.miss("COALESCE_UNAVAILABLE", null);
                        }
                        metrics.recordCoalescedHit();
                        return LookupResponse.coalescedHit(response);
                    });
        }

        String leaseId = slot.leaseId();

        // One release per lease, whichever way the future ends: stored, failed, or timed out.
        slot.result().whenComplete((value, error) -> releaseSlot(leaseId));

        int priority = request.priority() == null ? 0 : request.priority();
        long queuedAt = System.currentTimeMillis();

        return scheduler.acquire(priority).thenApply(granted -> {
            metrics.recordQueueWait(System.currentTimeMillis() - queuedAt);
            leaseHoldsSlot.put(leaseId, Boolean.TRUE.equals(granted));

            if (borderline != null) {
                return LookupResponse.needsJudge(new JudgeCandidate(borderline.similarity(),
                        borderline.entry().getOriginalQuery(), borderline.entry().getResponse()), leaseId);
            }
            return LookupResponse.miss("NO_COMPATIBLE_ENTRY", leaseId);
        });
    }

    public void store(StoreRequest request) {
        if (!properties.isEnabled()) {
            return;
        }

        validateEmbedding(request.embedding());

        long startedAt = System.nanoTime();
        CacheIdentity identity = identities.from(request);
        String key = identity.exactKey();

        int responseBytes = request.response().getBytes(StandardCharsets.UTF_8).length;
        boolean storable = responseBytes <= properties.getMaxResponseBytes();

        if (storable) {
            long now = System.currentTimeMillis();

            CacheEntry entry = new CacheEntry();
            entry.setCacheId(UUID.randomUUID().toString());
            entry.setOrgId(identity.orgId());
            entry.setCompatibilityKey(identity.compatibilityKey());
            entry.setNormalizedQuery(identity.normalizedQuery());
            entry.setOriginalQuery(request.query());
            entry.setEmbedding(request.embedding());
            entry.setResponse(request.response());
            entry.setModel(identity.model());
            entry.setModelVersion(identity.modelVersion());
            entry.setPromptVersion(identity.promptVersion());
            entry.setKbVersion(identity.kbVersion());
            entry.setRetrievalConfigHash(identity.retrievalConfigHash());
            entry.setGenerationConfigHash(identity.generationConfigHash());
            entry.setToolContextHash(identity.toolContextHash());
            entry.setLanguage(identity.language());
            entry.setCreatedAt(now);
            entry.setExpiresAt(now + properties.getTtlSeconds() * 1000);
            entry.setLastAccessedAt(now);
            entry.setTokenUsage(request.tokenUsage());

            promote(key, entry);
            bloom.add(key);
            redis.put(entry, key);
        } else {
            metrics.recordRejection();
            log.info("Response of {} bytes exceeds maxResponseBytes, not caching", responseBytes);
        }

        // Waiters get the answer whether or not it was small enough to keep.
        if (request.leaseId() != null) {
            coalescer.complete(request.leaseId(), request.response());
        }

        metrics.recordStoreLatency(System.nanoTime() - startedAt);
    }

    /** Owner could not generate an answer. Releases the waiters so they retry the pipeline. */
    public void release(String leaseId, String reason) {
        coalescer.fail(leaseId, reason == null ? "OWNER_FAILED" : reason);
    }

    public String invalidateOrg(String orgId, boolean bumpKbVersion) {
        Set<String> keys = keysByOrg.remove(orgId);
        if (keys != null) {
            keys.forEach(l1::remove);
        }
        lshIndex.clear(orgId);
        redis.invalidateOrg(orgId);

        String version = bumpKbVersion ? kbVersions.bump(orgId) : kbVersions.currentVersion(orgId);
        log.info("Invalidated cache for org {} ({} local entries), kbVersion now {}",
                orgId, keys == null ? 0 : keys.size(), version);
        return version;
    }

    public void clearAll() {
        l1.clear();
        lshIndex.clearAll();
        bloom.clear();
        keysByOrg.clear();
        coalescer.clear();
        log.warn("Semantic cache cleared");
    }

    public CacheStats stats() {
        long avoided = metrics.llmCallsAvoided();
        return new CacheStats(
                metrics.requests(),
                metrics.hits(),
                metrics.misses(),
                metrics.exactHits(),
                metrics.semanticHits(),
                metrics.coalescedHits(),
                metrics.rejections(),
                metrics.bloomRejections(),
                avoided,
                metrics.requests() == 0 ? 0.0 : (double) metrics.hits() / metrics.requests(),
                metrics.averageSimilarity(),
                l1.size(),
                l1.capacity(),
                l1.evictionCount(),
                coalescer.inFlightCount(),
                scheduler.queueDepth(),
                avoided * properties.getEstimatedTokensPerCall(),
                avoided * properties.getCostPerLlmCall());
    }

    public boolean redisHealthy() {
        return redis.isHealthy();
    }

    /** Sweeps expired entries so memory is not held by answers nothing will ever read again. */
    @Scheduled(fixedDelayString = "${semanticcache.expiry-sweep-ms:60000}")
    void sweepExpiredEntries() {
        long now = System.currentTimeMillis();
        keysByOrg.forEach((orgId, keys) -> keys.removeIf(key -> {
            CacheEntry entry = l1.get(key);
            if (entry == null) {
                lshIndex.remove(orgId, key);
                return true;
            }
            if (entry.isExpired(now)) {
                l1.remove(key);
                lshIndex.remove(orgId, key);
                return true;
            }
            return false;
        }));
    }

    @Scheduled(fixedDelayString = "${semanticcache.scheduler-aging-sweep-ms:1000}")
    void ageSchedulerWaiters() {
        scheduler.ageWaiters();
    }

    private void promote(String key, CacheEntry entry) {
        l1.put(key, entry);
        lshIndex.add(entry.getOrgId(), key, entry.getEmbedding());
        keysByOrg.computeIfAbsent(entry.getOrgId(), id -> ConcurrentHashMap.newKeySet()).add(key);
    }

    private void evict(String key, String orgId) {
        l1.remove(key);
        lshIndex.remove(orgId, key);
        forgetOrgKey(orgId, key);
    }

    private void forgetOrgKey(String orgId, String key) {
        Set<String> keys = keysByOrg.get(orgId);
        if (keys != null) {
            keys.remove(key);
        }
    }

    private void releaseSlot(String leaseId) {
        if (Boolean.TRUE.equals(leaseHoldsSlot.remove(leaseId))) {
            scheduler.release();
        }
    }

    private void validateEmbedding(float[] embedding) {
        if (embedding == null || embedding.length == 0) {
            throw new IllegalArgumentException("embedding is required");
        }
        if (embedding.length != properties.getEmbeddingDimension()) {
            throw new IllegalArgumentException("embedding dimension " + embedding.length
                    + " does not match configured " + properties.getEmbeddingDimension());
        }
    }
}
