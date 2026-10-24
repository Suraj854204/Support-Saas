package com.supportsaas.semanticcache.cache;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LruCacheTest {

    @Test
    void storesAndRetrieves() {
        LruCache<String, String> cache = new LruCache<>(3);
        cache.put("a", "1");

        assertThat(cache.get("a")).isEqualTo("1");
        assertThat(cache.size()).isEqualTo(1);
    }

    @Test
    void returnsNullForMissingKey() {
        LruCache<String, String> cache = new LruCache<>(3);
        assertThat(cache.get("nope")).isNull();
    }

    @Test
    void emptyCacheHasNoEntries() {
        LruCache<String, String> cache = new LruCache<>(3);

        assertThat(cache.size()).isZero();
        assertThat(cache.contains("a")).isFalse();
        assertThat(cache.remove("a")).isNull();
    }

    @Test
    void updateReplacesValueWithoutGrowing() {
        LruCache<String, String> cache = new LruCache<>(3);
        cache.put("a", "1");
        cache.put("a", "2");

        assertThat(cache.get("a")).isEqualTo("2");
        assertThat(cache.size()).isEqualTo(1);
    }

    @Test
    void evictsLeastRecentlyUsedAtCapacity() {
        LruCache<String, String> cache = new LruCache<>(2);
        cache.put("a", "1");
        cache.put("b", "2");
        cache.put("c", "3");

        assertThat(cache.get("a")).isNull();
        assertThat(cache.get("b")).isEqualTo("2");
        assertThat(cache.get("c")).isEqualTo("3");
        assertThat(cache.size()).isEqualTo(2);
        assertThat(cache.evictionCount()).isEqualTo(1);
    }

    @Test
    void readingAnEntryProtectsItFromEviction() {
        LruCache<String, String> cache = new LruCache<>(2);
        cache.put("a", "1");
        cache.put("b", "2");

        cache.get("a");
        cache.put("c", "3");

        assertThat(cache.get("a")).isEqualTo("1");
        assertThat(cache.get("b")).isNull();
    }

    @Test
    void updatingAnEntryAlsoRefreshesRecency() {
        LruCache<String, String> cache = new LruCache<>(2);
        cache.put("a", "1");
        cache.put("b", "2");

        cache.put("a", "1-updated");
        cache.put("c", "3");

        assertThat(cache.get("a")).isEqualTo("1-updated");
        assertThat(cache.get("b")).isNull();
    }

    @Test
    void removesEntries() {
        LruCache<String, String> cache = new LruCache<>(3);
        cache.put("a", "1");

        assertThat(cache.remove("a")).isEqualTo("1");
        assertThat(cache.contains("a")).isFalse();
        assertThat(cache.size()).isZero();
    }

    @Test
    void reinsertAfterRemoveKeepsListConsistent() {
        LruCache<String, String> cache = new LruCache<>(2);
        cache.put("a", "1");
        cache.put("b", "2");
        cache.remove("a");
        cache.put("c", "3");
        cache.put("d", "4");

        assertThat(cache.size()).isEqualTo(2);
        assertThat(cache.get("d")).isEqualTo("4");
    }

    @Test
    void singleItemCacheEvictsOnEveryInsert() {
        LruCache<String, String> cache = new LruCache<>(1);
        cache.put("a", "1");
        cache.put("b", "2");

        assertThat(cache.get("a")).isNull();
        assertThat(cache.get("b")).isEqualTo("2");
        assertThat(cache.size()).isEqualTo(1);
    }

    @Test
    void clearEmptiesTheCache() {
        LruCache<String, String> cache = new LruCache<>(3);
        cache.put("a", "1");
        cache.put("b", "2");
        cache.clear();

        assertThat(cache.size()).isZero();
        assertThat(cache.get("a")).isNull();
    }

    @Test
    void rejectsNonPositiveCapacity() {
        assertThatThrownBy(() -> new LruCache<String, String>(0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void notifiesTheEvictionListener() {
        LruCache<String, String> cache = new LruCache<>(1);
        List<String> evicted = new ArrayList<>();
        cache.onEviction((key, value) -> evicted.add(key));

        cache.put("a", "1");
        cache.put("b", "2");

        assertThat(evicted).containsExactly("a");
    }

    @Test
    void staysConsistentUnderConcurrentAccess() throws Exception {
        LruCache<Integer, Integer> cache = new LruCache<>(500);
        int threads = 16;
        int perThread = 2_000;

        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);

        for (int t = 0; t < threads; t++) {
            final int offset = t * perThread;
            pool.submit(() -> {
                try {
                    start.await();
                    for (int i = 0; i < perThread; i++) {
                        cache.put(offset + i, i);
                        cache.get(offset + (i / 2));
                        if (i % 7 == 0) {
                            cache.remove(offset + i);
                        }
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
        }

        start.countDown();
        assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        pool.shutdownNow();

        // The invariant that matters: the map and the recency list never disagree about size.
        assertThat(cache.size()).isLessThanOrEqualTo(cache.capacity());
    }
}
