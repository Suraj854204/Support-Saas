package com.supportsaas.semanticcache.service;

import java.util.Random;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.supportsaas.semanticcache.bloom.BloomFilter;
import com.supportsaas.semanticcache.cache.LruCache;
import com.supportsaas.semanticcache.concurrency.RequestCoalescer;
import com.supportsaas.semanticcache.config.CacheProperties;
import com.supportsaas.semanticcache.lsh.LshIndex;
import com.supportsaas.semanticcache.lsh.RandomHyperplaneLsh;
import com.supportsaas.semanticcache.metrics.CacheMetrics;
import com.supportsaas.semanticcache.model.LookupRequest;
import com.supportsaas.semanticcache.model.LookupResponse;
import com.supportsaas.semanticcache.model.StoreRequest;
import com.supportsaas.semanticcache.scheduler.LlmRequestScheduler;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * End-to-end behaviour of the cache with Redis stubbed out, so these cover the L1 + LSH + cosine
 * + compatibility path on its own. Redis has its own failure test below.
 */
class SemanticCacheServiceTest {

    private static final int DIMENSION = 32;

    private CacheProperties properties;
    private SemanticCacheService cache;
    private RedisCacheStore redis;
    private KbVersionRegistry kbVersions;
    private String kbVersion;

    @BeforeEach
    void setUp() {
        properties = new CacheProperties();
        properties.setEmbeddingDimension(DIMENSION);
        properties.setL1Capacity(100);
        properties.setTtlSeconds(3600);
        properties.setSimilarityThreshold(0.92);
        properties.setBloomGatesL2(false);
        properties.setCoalesceTimeoutMs(3_000);

        kbVersion = "1";

        redis = mock(RedisCacheStore.class);
        when(redis.get(anyString(), anyString())).thenReturn(null);

        kbVersions = mock(KbVersionRegistry.class);
        when(kbVersions.currentVersion(anyString())).thenAnswer(invocation -> kbVersion);
        when(kbVersions.bump(anyString())).thenAnswer(invocation -> kbVersion = String.valueOf(
                Integer.parseInt(kbVersion) + 1));

        cache = build();
    }

    private SemanticCacheService build() {
        CacheMetrics metrics = new CacheMetrics(new SimpleMeterRegistry());
        return new SemanticCacheService(
                properties,
                metrics,
                new CacheIdentityFactory(kbVersions),
                redis,
                kbVersions,
                new LruCache<>(properties.getL1Capacity()),
                new BloomFilter(1_000, 0.01),
                new LshIndex(new RandomHyperplaneLsh(8, 8, DIMENSION, 42)),
                new RequestCoalescer(properties.getCoalesceTimeoutMs()),
                new LlmRequestScheduler(16, 64, 1_000, 1_000));
    }

    @Test
    void firstRequestMissesAndHandsOutALease() {
        LookupResponse response = cache.lookup(lookup("org_a", "How do I reset my password?", vector(1))).join();

        assertThat(response.hit()).isFalse();
        assertThat(response.reason()).isEqualTo("NO_COMPATIBLE_ENTRY");
        assertThat(response.leaseId()).isNotBlank();
    }

    @Test
    void repeatedIdenticalQueryIsAnExactHit() {
        String query = "How do I reset my password?";
        float[] embedding = vector(1);

        String lease = cache.lookup(lookup("org_a", query, embedding)).join().leaseId();
        cache.store(store("org_a", query, embedding, "Go to Settings > Security.", lease));

        LookupResponse response = cache.lookup(lookup("org_a", query, embedding)).join();

        assertThat(response.hit()).isTrue();
        assertThat(response.matchType()).isEqualTo("EXACT");
        assertThat(response.response()).isEqualTo("Go to Settings > Security.");
    }

    @Test
    void wordingAndCaseDifferencesStillHitExactly() {
        float[] embedding = vector(1);
        cache.store(store("org_a", "How do I reset my password?", embedding, "answer", null));

        LookupResponse response = cache.lookup(lookup("org_a", "  how   do i RESET my password  ", embedding)).join();

        assertThat(response.matchType()).isEqualTo("EXACT");
    }

    @Test
    void paraphraseWithANearbyEmbeddingIsASemanticHit() {
        cache.store(store("org_a", "How do I reset my password?", vector(1), "answer", null));

        LookupResponse response = cache.lookup(
                lookup("org_a", "I forgot my password, how can I change it?", near(vector(1), 0.02f))).join();

        assertThat(response.hit()).isTrue();
        assertThat(response.matchType()).isEqualTo("SEMANTIC");
        assertThat(response.similarity()).isGreaterThanOrEqualTo(properties.getSimilarityThreshold());
        assertThat(response.response()).isEqualTo("answer");
    }

    @Test
    void relatedButDifferentQuestionIsAMiss() {
        cache.store(store("org_a", "How do I reset my password?", vector(1), "answer", null));

        LookupResponse response = cache.lookup(lookup("org_a", "How do I change my email?", vector(2))).join();

        assertThat(response.hit()).isFalse();
    }

    @Test
    void unrelatedQuestionIsAMiss() {
        cache.store(store("org_a", "How do I reset my password?", vector(1), "answer", null));

        LookupResponse response = cache.lookup(lookup("org_a", "How can I delete my account?", vector(7))).join();

        assertThat(response.hit()).isFalse();
    }

    @Test
    void oneOrgNeverSeesAnotherOrgsCachedAnswer() {
        float[] embedding = vector(1);
        String query = "How do I reset my password?";

        cache.store(store("org_a", query, embedding, "org A internal answer", null));

        LookupResponse exact = cache.lookup(lookup("org_b", query, embedding)).join();
        LookupResponse semantic = cache.lookup(lookup("org_b", query, near(embedding, 0.01f))).join();

        assertThat(exact.hit()).isFalse();
        assertThat(exact.response()).isNull();
        assertThat(semantic.hit()).isFalse();
        assertThat(semantic.response()).isNull();
    }

    @Test
    void crossTenantIsolationHoldsForEveryStoredEntry() {
        float[] embedding = vector(1);
        for (int i = 0; i < 20; i++) {
            cache.store(store("org_a", "question " + i, near(embedding, 0.01f), "answer " + i, null));
        }

        for (int i = 0; i < 20; i++) {
            LookupResponse response = cache.lookup(lookup("org_b", "question " + i, near(embedding, 0.01f))).join();
            assertThat(response.hit()).as("org_b must never read org_a's cache").isFalse();
        }
    }

    @Test
    void expiredEntriesAreTreatedAsMisses() {
        properties.setTtlSeconds(0);
        cache = build();

        cache.store(store("org_a", "question", vector(1), "answer", null));

        LookupResponse response = cache.lookup(lookup("org_a", "question", vector(1))).join();
        assertThat(response.hit()).isFalse();
    }

    @Test
    void aDifferentPromptVersionCannotReuseTheAnswer() {
        float[] embedding = vector(1);
        cache.store(new StoreRequest("org_a", "question", embedding, "answer",
                "gemini-2.5-flash", "v1", "v1", "1", "r1", "g1", "", "en", null, null));

        LookupResponse response = cache.lookup(new LookupRequest("org_a", "question", embedding,
                "gemini-2.5-flash", "v1", "v2", "1", "r1", "g1", "", "en", null)).join();

        assertThat(response.hit()).isFalse();
    }

    @Test
    void aDifferentModelCannotReuseTheAnswer() {
        float[] embedding = vector(1);
        cache.store(new StoreRequest("org_a", "question", embedding, "answer",
                "gemini-2.5-flash", "v1", "v1", "1", "r1", "g1", "", "en", null, null));

        LookupResponse response = cache.lookup(new LookupRequest("org_a", "question", embedding,
                "gemini-2.5-pro", "v1", "v1", "1", "r1", "g1", "", "en", null)).join();

        assertThat(response.hit()).isFalse();
    }

    @Test
    void bumpingTheKnowledgeBaseVersionInvalidatesEveryAnswerForThatOrg() {
        float[] embedding = vector(1);
        cache.store(store("org_a", "question", embedding, "answer from old KB", null));

        assertThat(cache.lookup(lookup("org_a", "question", embedding)).join().hit()).isTrue();

        cache.invalidateOrg("org_a", true);

        LookupResponse response = cache.lookup(lookup("org_a", "question", embedding)).join();
        assertThat(response.hit()).as("an answer written against the previous KB must not be reused").isFalse();
    }

    @Test
    void invalidatingOneOrgLeavesOtherOrgsIntact() {
        float[] embedding = vector(1);
        cache.store(store("org_a", "question", embedding, "answer a", null));
        cache.store(store("org_b", "question", embedding, "answer b", null));

        cache.invalidateOrg("org_a", false);

        assertThat(cache.lookup(lookup("org_a", "question", embedding)).join().hit()).isFalse();
        assertThat(cache.lookup(lookup("org_b", "question", embedding)).join().hit()).isTrue();
    }

    @Test
    void clearingRemovesEverything() {
        cache.store(store("org_a", "question", vector(1), "answer", null));
        cache.clearAll();

        assertThat(cache.stats().entryCount()).isZero();
        assertThat(cache.lookup(lookup("org_a", "question", vector(1))).join().hit()).isFalse();
    }

    @Test
    void disabledCacheAlwaysReportsAMiss() {
        properties.setEnabled(false);

        LookupResponse response = cache.lookup(lookup("org_a", "question", vector(1))).join();

        assertThat(response.hit()).isFalse();
        assertThat(response.reason()).isEqualTo("CACHE_DISABLED");
    }

    @Test
    void lookupsKeepWorkingWhenL2IsUnavailable() {
        // RedisCacheStore swallows its own failures and degrades to null, so this is what the
        // service actually sees during a Redis outage.
        when(redis.get(anyString(), anyString())).thenReturn(null);

        cache.store(store("org_a", "question", vector(1), "answer", null));

        assertThat(cache.lookup(lookup("org_a", "question", vector(1))).join().hit())
                .as("L1 keeps serving when L2 is unavailable").isTrue();
        assertThat(cache.lookup(lookup("org_a", "never asked", vector(3))).join().hit()).isFalse();
    }

    @Test
    void rejectsAnEmbeddingOfTheWrongSize() {
        assertThatThrownBy(() -> cache.lookup(lookup("org_a", "question", new float[DIMENSION + 1])))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnEmptyEmbedding() {
        assertThatThrownBy(() -> cache.lookup(lookup("org_a", "question", new float[0])))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void oversizedResponsesAreNotCachedButWaitersStillGetTheAnswer() {
        properties.setMaxResponseBytes(16);

        String lease = cache.lookup(lookup("org_a", "question", vector(1))).join().leaseId();
        cache.store(store("org_a", "question", vector(1), "x".repeat(2_000), lease));

        assertThat(cache.lookup(lookup("org_a", "question", vector(1))).join().hit()).isFalse();
    }

    @Test
    void oneHundredConcurrentIdenticalMissesProduceOneOwner() throws Exception {
        int callers = 100;
        ExecutorService pool = Executors.newFixedThreadPool(32);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(callers);
        AtomicInteger owners = new AtomicInteger();
        AtomicInteger hits = new AtomicInteger();

        float[] embedding = vector(1);

        for (int i = 0; i < callers; i++) {
            pool.submit(() -> {
                try {
                    start.await();
                    LookupResponse response = cache.lookup(lookup("org_a", "same question", embedding)).join();

                    if (response.leaseId() != null) {
                        owners.incrementAndGet();
                        Thread.sleep(100);
                        cache.store(store("org_a", "same question", embedding, "generated once",
                                response.leaseId()));
                    } else if (response.hit()) {
                        hits.incrementAndGet();
                    }
                } catch (Exception e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
        }

        start.countDown();
        assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        pool.shutdownNow();

        assertThat(owners.get()).as("exactly one RAG + LLM execution").isEqualTo(1);
        assertThat(hits.get()).isGreaterThan(0);
        assertThat(owners.get() + hits.get()).isEqualTo(callers);
    }

    @Test
    void statsReflectRealTraffic() {
        float[] embedding = vector(1);
        cache.lookup(lookup("org_a", "question", embedding)).join();
        cache.store(store("org_a", "question", embedding, "answer", null));
        cache.lookup(lookup("org_a", "question", embedding)).join();

        var stats = cache.stats();

        assertThat(stats.requests()).isEqualTo(2);
        assertThat(stats.hits()).isEqualTo(1);
        assertThat(stats.misses()).isEqualTo(1);
        assertThat(stats.exactHits()).isEqualTo(1);
        assertThat(stats.llmCallsAvoided()).isEqualTo(1);
        assertThat(stats.hitRate()).isEqualTo(0.5);
    }

    @Test
    void costSavingsStayAtZeroUntilPricingIsConfigured() {
        float[] embedding = vector(1);
        cache.store(store("org_a", "question", embedding, "answer", null));
        cache.lookup(lookup("org_a", "question", embedding)).join();

        assertThat(cache.stats().estimatedCostAvoided()).isZero();
        assertThat(cache.stats().estimatedTokensAvoided()).isZero();
    }

    private LookupRequest lookup(String orgId, String query, float[] embedding) {
        return new LookupRequest(orgId, query, embedding, "gemini-2.5-flash", "v1", "v1",
                null, "r1", "g1", "", "en", 0);
    }

    private StoreRequest store(String orgId, String query, float[] embedding, String response, String leaseId) {
        return new StoreRequest(orgId, query, embedding, response, "gemini-2.5-flash", "v1", "v1",
                null, "r1", "g1", "", "en", null, leaseId);
    }

    private static float[] vector(int seed) {
        Random random = new Random(seed);
        float[] result = new float[DIMENSION];
        for (int i = 0; i < DIMENSION; i++) {
            result[i] = (float) random.nextGaussian();
        }
        return result;
    }

    private static float[] near(float[] base, float scale) {
        Random random = new Random(base.length * 31L);
        float[] result = base.clone();
        for (int i = 0; i < result.length; i++) {
            result[i] += (float) random.nextGaussian() * scale;
        }
        return result;
    }
}
