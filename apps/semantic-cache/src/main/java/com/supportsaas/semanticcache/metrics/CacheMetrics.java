package com.supportsaas.semanticcache.metrics;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.DoubleAdder;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

/**
 * Micrometer instruments for the cache, exported on /actuator/prometheus.
 *
 * Every counter here is incremented from the real code path. Percentiles come from Micrometer's
 * own histograms rather than being computed by hand.
 */
@Component
public class CacheMetrics {

    private final Counter requests;
    private final Counter hits;
    private final Counter misses;
    private final Counter exactHits;
    private final Counter semanticHits;
    private final Counter coalescedHits;
    private final Counter rejections;
    private final Counter bloomRejections;
    private final Counter llmCallsAvoided;
    private final Counter coalescedRequests;
    private final Counter evictions;
    private final Counter errors;

    private final DistributionSummary similarity;
    private final DistributionSummary candidateCount;

    private final Timer lookupLatency;
    private final Timer storeLatency;
    private final Timer queueWait;

    // Kept alongside the meters because the stats endpoint needs readable totals, and Micrometer
    // counters are write-only from the application's point of view.
    private final AtomicLong requestCount = new AtomicLong();
    private final AtomicLong hitCount = new AtomicLong();
    private final AtomicLong missCount = new AtomicLong();
    private final AtomicLong exactHitCount = new AtomicLong();
    private final AtomicLong semanticHitCount = new AtomicLong();
    private final AtomicLong coalescedHitCount = new AtomicLong();
    private final AtomicLong rejectionCount = new AtomicLong();
    private final AtomicLong bloomRejectionCount = new AtomicLong();
    private final AtomicLong llmCallsAvoidedCount = new AtomicLong();
    private final AtomicLong similaritySamples = new AtomicLong();
    private final DoubleAdder similarityTotal = new DoubleAdder();

    public CacheMetrics(MeterRegistry registry) {
        this.requests = Counter.builder("cache_requests_total").register(registry);
        this.hits = Counter.builder("cache_hits_total").register(registry);
        this.misses = Counter.builder("cache_misses_total").register(registry);
        this.exactHits = Counter.builder("cache_exact_hits_total").register(registry);
        this.semanticHits = Counter.builder("cache_semantic_hits_total").register(registry);
        this.coalescedHits = Counter.builder("cache_coalesced_hits_total").register(registry);
        this.rejections = Counter.builder("cache_rejections_total")
                .description("candidates dropped by TTL or compatibility checks").register(registry);
        this.bloomRejections = Counter.builder("bloom_filter_rejections_total").register(registry);
        this.llmCallsAvoided = Counter.builder("llm_calls_avoided_total").register(registry);
        this.coalescedRequests = Counter.builder("requests_coalesced_total").register(registry);
        this.evictions = Counter.builder("lru_evictions_total").register(registry);
        this.errors = Counter.builder("cache_errors_total").register(registry);

        this.similarity = DistributionSummary.builder("semantic_similarity_distribution")
                .publishPercentiles(0.5, 0.95, 0.99).register(registry);
        this.candidateCount = DistributionSummary.builder("semantic_candidates")
                .publishPercentiles(0.5, 0.95).register(registry);

        this.lookupLatency = Timer.builder("cache_lookup_latency")
                .publishPercentiles(0.5, 0.95, 0.99).register(registry);
        this.storeLatency = Timer.builder("cache_store_latency")
                .publishPercentiles(0.5, 0.95, 0.99).register(registry);
        this.queueWait = Timer.builder("scheduler_queue_wait")
                .publishPercentiles(0.5, 0.95, 0.99).register(registry);
    }

    public void recordRequest() {
        requests.increment();
        requestCount.incrementAndGet();
    }

    public void recordExactHit() {
        hits.increment();
        exactHits.increment();
        llmCallsAvoided.increment();
        hitCount.incrementAndGet();
        exactHitCount.incrementAndGet();
        llmCallsAvoidedCount.incrementAndGet();
    }

    public void recordSemanticHit(double score) {
        hits.increment();
        semanticHits.increment();
        llmCallsAvoided.increment();
        hitCount.incrementAndGet();
        semanticHitCount.incrementAndGet();
        llmCallsAvoidedCount.incrementAndGet();
        recordSimilarity(score);
    }

    public void recordCoalescedHit() {
        hits.increment();
        coalescedHits.increment();
        coalescedRequests.increment();
        llmCallsAvoided.increment();
        hitCount.incrementAndGet();
        coalescedHitCount.incrementAndGet();
        llmCallsAvoidedCount.incrementAndGet();
    }

    public void recordMiss() {
        misses.increment();
        missCount.incrementAndGet();
    }

    public void recordRejection() {
        rejections.increment();
        rejectionCount.incrementAndGet();
    }

    public void recordBloomRejection() {
        bloomRejections.increment();
        bloomRejectionCount.incrementAndGet();
    }

    public void recordEviction() {
        evictions.increment();
    }

    public void recordError() {
        errors.increment();
    }

    public void recordSimilarity(double score) {
        similarity.record(score);
        similarityTotal.add(score);
        similaritySamples.incrementAndGet();
    }

    public void recordCandidates(int count) {
        candidateCount.record(count);
    }

    public void recordLookupLatency(long nanos) {
        lookupLatency.record(nanos, TimeUnit.NANOSECONDS);
    }

    public void recordStoreLatency(long nanos) {
        storeLatency.record(nanos, TimeUnit.NANOSECONDS);
    }

    public void recordQueueWait(long millis) {
        queueWait.record(millis, TimeUnit.MILLISECONDS);
    }

    public long requests() {
        return requestCount.get();
    }

    public long hits() {
        return hitCount.get();
    }

    public long misses() {
        return missCount.get();
    }

    public long exactHits() {
        return exactHitCount.get();
    }

    public long semanticHits() {
        return semanticHitCount.get();
    }

    public long coalescedHits() {
        return coalescedHitCount.get();
    }

    public long rejections() {
        return rejectionCount.get();
    }

    public long bloomRejections() {
        return bloomRejectionCount.get();
    }

    public long llmCallsAvoided() {
        return llmCallsAvoidedCount.get();
    }

    public double averageSimilarity() {
        long samples = similaritySamples.get();
        return samples == 0 ? 0.0 : similarityTotal.sum() / samples;
    }
}
