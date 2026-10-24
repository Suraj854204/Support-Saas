package com.supportsaas.semanticcache.bench;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;

import com.supportsaas.semanticcache.bloom.BloomFilter;
import com.supportsaas.semanticcache.cache.LruCache;
import com.supportsaas.semanticcache.concurrency.RequestCoalescer;
import com.supportsaas.semanticcache.config.CacheProperties;
import com.supportsaas.semanticcache.lsh.LshIndex;
import com.supportsaas.semanticcache.lsh.RandomHyperplaneLsh;
import com.supportsaas.semanticcache.metrics.CacheMetrics;
import com.supportsaas.semanticcache.model.CacheEntry;
import com.supportsaas.semanticcache.model.LookupRequest;
import com.supportsaas.semanticcache.model.LookupResponse;
import com.supportsaas.semanticcache.model.StoreRequest;
import com.supportsaas.semanticcache.scheduler.LlmRequestScheduler;
import com.supportsaas.semanticcache.service.CacheIdentityFactory;
import com.supportsaas.semanticcache.service.KbVersionRegistry;
import com.supportsaas.semanticcache.service.RedisCacheStore;
import com.supportsaas.semanticcache.service.SemanticCacheService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Load benchmark. Run it explicitly:
 *
 *   mvn test -Dtest=CacheBenchmark -Dbenchmark=true
 *
 * It prints what it measured on the machine it ran on and asserts only the two properties that
 * must hold everywhere: no cross-tenant reuse, and no reuse of an answer for a question the
 * threshold should have rejected.
 *
 * The embeddings here are synthetic vectors with controlled angles, not Gemini output. That
 * makes the run reproducible and isolates the cache machinery, but it means the hit rate below
 * reflects the geometry this harness generates — not how often real customer paraphrases land
 * above the threshold. Only a replay of production traffic answers that.
 */
class CacheBenchmark {

    private static final int DIMENSION = 768;
    private static final int LSH_TABLES = 8;
    private static final int LSH_HYPERPLANES = 12;

    private record Query(String org, String text, float[] embedding, boolean shouldHit) {
    }

    @Test
    @EnabledIfSystemProperty(named = "benchmark", matches = "true")
    void measureHitRateAndLatency() {
        CacheProperties properties = new CacheProperties();
        properties.setEmbeddingDimension(DIMENSION);
        properties.setL1Capacity(10_000);
        properties.setTtlSeconds(3600);
        properties.setSimilarityThreshold(0.92);
        properties.setBloomGatesL2(false);
        properties.setLshTables(LSH_TABLES);
        properties.setLshHyperplanes(LSH_HYPERPLANES);

        SemanticCacheService cache = build(properties);
        Random random = new Random(1234);

        List<Query> workload = new ArrayList<>();
        int topics = 100;

        for (int topic = 0; topic < topics; topic++) {
            float[] base = randomVector(random);

            // Seed the cache with the first answer for this topic.
            cache.store(new StoreRequest("org_a", "topic-" + topic, base, "answer-" + topic,
                    "m", "v1", "v1", "1", "r", "g", "", "en", null, null));

            // Exact duplicates.
            for (int i = 0; i < 5; i++) {
                workload.add(new Query("org_a", "topic-" + topic, base, true));
            }
            // Paraphrases: same intent, small angle.
            for (int i = 0; i < 3; i++) {
                workload.add(new Query("org_a", "paraphrase-" + topic + "-" + i,
                        rotate(base, 0.15, random), true));
            }
            // Related but different: close enough to be tempting, far enough to be wrong to reuse.
            workload.add(new Query("org_a", "related-" + topic, rotate(base, 0.9, random), false));
            // Unrelated.
            workload.add(new Query("org_a", "unrelated-" + topic, randomVector(random), false));
            // Same question, different tenant.
            workload.add(new Query("org_b", "topic-" + topic, base, false));
        }

        java.util.Collections.shuffle(workload, random);

        long[] latencies = new long[workload.size()];
        int hits = 0;
        int semanticHits = 0;
        int falsePositives = 0;
        int crossTenantLeaks = 0;

        for (int i = 0; i < workload.size(); i++) {
            Query query = workload.get(i);

            long startedAt = System.nanoTime();
            LookupResponse response = cache.lookup(new LookupRequest(query.org(), query.text(),
                    query.embedding(), "m", "v1", "v1", "1", "r", "g", "", "en", 0)).join();
            latencies[i] = System.nanoTime() - startedAt;

            if (response.hit()) {
                hits++;
                if ("SEMANTIC".equals(response.matchType())) {
                    semanticHits++;
                }
                if (!query.shouldHit()) {
                    falsePositives++;
                    if ("org_b".equals(query.org())) {
                        crossTenantLeaks++;
                    }
                }
            }
        }

        Arrays.sort(latencies);
        var stats = cache.stats();
        Runtime runtime = Runtime.getRuntime();
        runtime.gc();
        long heapUsedMb = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024);

        System.out.printf("""

                SemantiCache benchmark (synthetic embeddings, dim=%d)
                ----------------------------------------------------
                requests                %d
                cached entries          %d
                cache hit rate          %.3f
                semantic hit rate       %.3f
                exact hits              %d
                semantic hits           %d
                LLM calls avoided       %d
                false positives         %d
                cross-tenant leaks      %d
                rejections              %d
                avg best similarity     %.4f
                lookup p50              %.3f ms
                lookup p95              %.3f ms
                lookup p99              %.3f ms
                heap in use             %d MB
                %n""",
                DIMENSION,
                workload.size(),
                stats.entryCount(),
                (double) hits / workload.size(),
                (double) semanticHits / workload.size(),
                stats.exactHits(),
                stats.semanticHits(),
                stats.llmCallsAvoided(),
                falsePositives,
                crossTenantLeaks,
                stats.rejections(),
                stats.averageSimilarity(),
                latencies[(int) (latencies.length * 0.50)] / 1_000_000.0,
                latencies[(int) (latencies.length * 0.95)] / 1_000_000.0,
                latencies[(int) (latencies.length * 0.99)] / 1_000_000.0,
                heapUsedMb);

        assertThat(crossTenantLeaks).as("cross-tenant reuse").isZero();
        assertThat(falsePositives).as("answers reused for questions below the threshold").isZero();
    }

    private static SemanticCacheService build(CacheProperties properties) {
        RedisCacheStore redis = mock(RedisCacheStore.class);
        when(redis.get(anyString(), anyString())).thenReturn((CacheEntry) null);

        KbVersionRegistry kbVersions = mock(KbVersionRegistry.class);
        when(kbVersions.currentVersion(anyString())).thenReturn("1");

        return new SemanticCacheService(
                properties,
                new CacheMetrics(new SimpleMeterRegistry()),
                new CacheIdentityFactory(kbVersions),
                redis,
                kbVersions,
                new LruCache<>(properties.getL1Capacity()),
                new BloomFilter(properties.getBloomExpectedInsertions(), properties.getBloomFalsePositiveRate()),
                new LshIndex(new RandomHyperplaneLsh(LSH_TABLES, LSH_HYPERPLANES, DIMENSION, 42)),
                new RequestCoalescer(properties.getCoalesceTimeoutMs()),
                new LlmRequestScheduler(64, 512, 1_000, 1_000));
    }

    private static float[] randomVector(Random random) {
        float[] vector = new float[DIMENSION];
        for (int i = 0; i < DIMENSION; i++) {
            vector[i] = (float) random.nextGaussian();
        }
        return vector;
    }

    /** Mixes in a random direction; larger weight means a larger angle from the base vector. */
    private static float[] rotate(float[] base, double weight, Random random) {
        float[] noise = randomVector(random);
        float[] result = new float[base.length];
        for (int i = 0; i < base.length; i++) {
            result[i] = (float) (base[i] * (1 - weight) + noise[i] * weight);
        }
        return result;
    }
}
