package com.supportsaas.semanticcache.cache;

/**
 * Recency list for {@link LruCache}. Head is the most recently used entry, tail the least.
 * Sentinel head/tail nodes remove the null checks that usually make unlink logic buggy.
 *
 * Not thread-safe on its own; LruCache owns the lock.
 */
class DoublyLinkedList<K, V> {

    private final CacheNode<K, V> head = new CacheNode<>(null, null);
    private final CacheNode<K, V> tail = new CacheNode<>(null, null);

    DoublyLinkedList() {
        head.next = tail;
        tail.prev = head;
    }

    void addFirst(CacheNode<K, V> node) {
        node.prev = head;
        node.next = head.next;
        head.next.prev = node;
        head.next = node;
    }

    void unlink(CacheNode<K, V> node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
        node.prev = null;
        node.next = null;
    }

    void moveToFront(CacheNode<K, V> node) {
        if (head.next == node) {
            return;
        }
        unlink(node);
        addFirst(node);
    }

    /** Least recently used node, or null when the list is empty. */
    CacheNode<K, V> last() {
        CacheNode<K, V> node = tail.prev;
        return node == head ? null : node;
    }

    void clear() {
        head.next = tail;
        tail.prev = head;
    }
}
