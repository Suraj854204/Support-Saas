package com.supportsaas.semanticcache.bloom;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * Counting-free Bloom filter over a long[] bit array.
 *
 * Used as the first gate in a lookup: if the filter says a cache identity was never inserted,
 * we can answer "miss" without touching the LRU, Redis or the LSH index. A positive answer means
 * "maybe present" and nothing more — false positives are inherent to the structure and simply
 * cost us the normal lookup path. False negatives cannot happen, which is the property that
 * makes the shortcut safe.
 *
 * Bit count and hash count follow the standard sizing formulas for the configured expected
 * insertion count and target false-positive rate. The two base hashes are derived from one
 * 128-bit FNV-1a-style digest and combined as h1 + i*h2 (Kirsch-Mitzenmacher), which gives k
 * independent-enough positions without running k separate hash functions.
 *
 * Deletion is not supported — clearing a single entry would clear bits shared with other
 * entries. Entries removed from the cache therefore stay "maybe present" until the filter is
 * rebuilt, which only costs an occasional wasted lookup.
 */
public class BloomFilter {

    private final long[] bits;
    private final int bitCount;
    private final int hashCount;

    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    private final AtomicLong insertions = new AtomicLong();

    public BloomFilter(int expectedInsertions, double falsePositiveRate) {
        if (expectedInsertions <= 0) {
            throw new IllegalArgumentException("expectedInsertions must be positive");
        }
        if (falsePositiveRate <= 0 || falsePositiveRate >= 1) {
            throw new IllegalArgumentException("falsePositiveRate must be between 0 and 1");
        }

        double ln2 = Math.log(2);
        long m = (long) Math.ceil(-expectedInsertions * Math.log(falsePositiveRate) / (ln2 * ln2));
        this.bitCount = (int) Math.min(Math.max(m, 64), Integer.MAX_VALUE - 64);
        this.hashCount = Math.max(1, (int) Math.round((double) bitCount / expectedInsertions * ln2));
        this.bits = new long[(bitCount + 63) / 64];
    }

    public void add(String value) {
        long[] hashes = hash(value);
        lock.writeLock().lock();
        try {
            for (int i = 0; i < hashCount; i++) {
                int position = position(hashes, i);
                bits[position >>> 6] |= 1L << (position & 63);
            }
        } finally {
            lock.writeLock().unlock();
        }
        insertions.incrementAndGet();
    }

    /** False when the value was definitely never added. True means "possibly added". */
    public boolean mightContain(String value) {
        long[] hashes = hash(value);
        lock.readLock().lock();
        try {
            for (int i = 0; i < hashCount; i++) {
                int position = position(hashes, i);
                if ((bits[position >>> 6] & (1L << (position & 63))) == 0) {
                    return false;
                }
            }
            return true;
        } finally {
            lock.readLock().unlock();
        }
    }

    public void clear() {
        lock.writeLock().lock();
        try {
            java.util.Arrays.fill(bits, 0L);
        } finally {
            lock.writeLock().unlock();
        }
        insertions.set(0);
    }

    public int bitCount() {
        return bitCount;
    }

    public int hashCount() {
        return hashCount;
    }

    public long insertionCount() {
        return insertions.get();
    }

    /** Current theoretical false-positive rate given how full the filter actually is. */
    public double estimatedFalsePositiveRate() {
        double inserted = insertions.get();
        double exponent = -((double) hashCount * inserted) / bitCount;
        return Math.pow(1 - Math.exp(exponent), hashCount);
    }

    private int position(long[] hashes, int i) {
        long combined = hashes[0] + (long) i * hashes[1];
        return (int) Math.floorMod(combined, (long) bitCount);
    }

    /** Two FNV-1a variants over the same bytes; cheap and good enough for bit spreading. */
    private static long[] hash(String value) {
        byte[] data = value.getBytes(StandardCharsets.UTF_8);

        long h1 = 0xcbf29ce484222325L;
        long h2 = 0x9e3779b97f4a7c15L;

        for (byte b : data) {
            h1 ^= (b & 0xff);
            h1 *= 0x100000001b3L;

            h2 += (b & 0xff);
            h2 *= 0xff51afd7ed558ccdL;
            h2 ^= (h2 >>> 33);
        }

        return new long[] { h1, h2 | 1L };
    }
}
