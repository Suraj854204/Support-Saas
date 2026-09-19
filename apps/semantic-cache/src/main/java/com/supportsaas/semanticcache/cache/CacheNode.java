package com.supportsaas.semanticcache.cache;

/** Intrusive list node. Keeping the node inside the map value is what makes remove() O(1). */
class CacheNode<K, V> {

    final K key;
    V value;

    CacheNode<K, V> prev;
    CacheNode<K, V> next;

    CacheNode(K key, V value) {
        this.key = key;
        this.value = value;
    }
}
