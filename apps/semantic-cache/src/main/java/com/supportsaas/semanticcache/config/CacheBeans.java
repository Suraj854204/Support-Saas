package com.supportsaas.semanticcache.config;

import com.supportsaas.semanticcache.bloom.BloomFilter;
import com.supportsaas.semanticcache.cache.LruCache;
import com.supportsaas.semanticcache.concurrency.RequestCoalescer;
import com.supportsaas.semanticcache.lsh.LshIndex;
import com.supportsaas.semanticcache.lsh.RandomHyperplaneLsh;
import com.supportsaas.semanticcache.model.CacheEntry;
import com.supportsaas.semanticcache.scheduler.LlmRequestScheduler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The hand-written data structures are plain objects, so they are wired up here rather than component-scanned. */
@Configuration
public class CacheBeans {

    @Bean
    public LruCache<String, CacheEntry> l1Cache(CacheProperties properties) {
        return new LruCache<>(properties.getL1Capacity());
    }

    @Bean
    public BloomFilter bloomFilter(CacheProperties properties) {
        return new BloomFilter(properties.getBloomExpectedInsertions(), properties.getBloomFalsePositiveRate());
    }

    @Bean
    public LshIndex lshIndex(CacheProperties properties) {
        return new LshIndex(new RandomHyperplaneLsh(
                properties.getLshTables(),
                properties.getLshHyperplanes(),
                properties.getEmbeddingDimension(),
                properties.getLshSeed()));
    }

    @Bean
    public RequestCoalescer requestCoalescer(CacheProperties properties) {
        return new RequestCoalescer(properties.getCoalesceTimeoutMs());
    }

    @Bean
    public LlmRequestScheduler llmRequestScheduler(CacheProperties properties) {
        return new LlmRequestScheduler(
                properties.getSchedulerMaxConcurrent(),
                properties.getSchedulerMaxQueueSize(),
                properties.getSchedulerAcquireTimeoutMs(),
                properties.getSchedulerAgingAfterMs());
    }
}
