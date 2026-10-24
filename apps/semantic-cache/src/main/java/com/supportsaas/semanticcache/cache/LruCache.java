package com.supportsaas.semanticcache.cache;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.BiConsumer;

/**
 * Fixed-capacity LRU built from a HashMap plus a doubly linked list.
 *
 * The map gives O(1) key lookup and stores the list node itself, so promoting an entry to
 * most-recently-used, deleting it, or evicting the tail are pointer swaps rather than scans.
 * LinkedHashMap would cover the basic behaviour but hides the mechanics, and we need the
 * eviction hook to keep the LSH index from holding on to entries the cache has dropped.
 *
 * Thread safety: one ReentrantLock guards the map and the list together, because a recency
 * update touches both and they must not drift apart. Each critical section is a handful of
 * pointer writes. A striped design would scale further; it is not worth the complexity at the
 * cache sizes this service runs at.
 */
public class LruCache<K, V> {

    private final int capacity;
    private final Map<K, CacheNode<K, V>> index;
    private final DoublyLinkedList<K, V> recency = new DoublyLinkedList<>();
    private final ReentrantLock lock = new ReentrantLock();

    private BiConsumer<K, V> evictionListener = (k, v) -> { };
    private long evictions;

    public LruCache(int capacity) {
        if (capacity <= 0) {
            throw new IllegalArgumentException("capacity must be positive");
        }
        this.capacity = capacity;
        this.index = new HashMap<>(Math.min(capacity, 1024));
    }

    /** Called after an entry is dropped to make room. Used to unindex the entry from LSH. */
    public void onEviction(BiConsumer<K, V> listener) {
        this.evictionListener = listener;
    }

    public V get(K key) {
        lock.lock();
        try {
            CacheNode<K, V> node = index.get(key);
            if (node == null) {
                return null;
            }
            recency.moveToFront(node);
            return node.value;
        } finally {
            lock.unlock();
        }
    }

    /** Inserts or updates, then evicts the least recently used entry if we are over capacity. */
    public void put(K key, V value) {
        K evictedKey = null;
        V evictedValue = null;

        lock.lock();
        try {
            CacheNode<K, V> existing = index.get(key);
            if (existing != null) {
                existing.value = value;
                recency.moveToFront(existing);
                return;
            }

            CacheNode<K, V> node = new CacheNode<>(key, value);
            index.put(key, node);
            recency.addFirst(node);

            if (index.size() > capacity) {
                CacheNode<K, V> victim = recency.last();
                recency.unlink(victim);
                index.remove(victim.key);
                evictions++;
                evictedKey = victim.key;
                evictedValue = victim.value;
            }
        } finally {
            lock.unlock();
        }

        // Fired outside the lock: the listener touches the LSH index and holding two
        // structures' locks at once is how deadlocks start.
        if (evictedKey != null) {
            evictionListener.accept(evictedKey, evictedValue);
        }
    }

    public V remove(K key) {
        lock.lock();
        try {
            CacheNode<K, V> node = index.remove(key);
            if (node == null) {
                return null;
            }
            recency.unlink(node);
            return node.value;
        } finally {
            lock.unlock();
        }
    }

    public boolean contains(K key) {
        lock.lock();
        try {
            return index.containsKey(key);
        } finally {
            lock.unlock();
        }
    }

    public void clear() {
        lock.lock();
        try {
            index.clear();
            recency.clear();
        } finally {
            lock.unlock();
        }
    }

    public int size() {
        lock.lock();
        try {
            return index.size();
        } finally {
            lock.unlock();
        }
    }

    public int capacity() {
        return capacity;
    }

    public long evictionCount() {
        lock.lock();
        try {
            return evictions;
        } finally {
            lock.unlock();
        }
    }
}
