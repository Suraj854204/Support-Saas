package com.supportsaas.semanticcache.lsh;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Bucket store on top of {@link RandomHyperplaneLsh}, partitioned by organization.
 *
 * Each org gets its own set of tables, so a candidate lookup can only ever surface keys that
 * belong to the caller's org. That is a structural guarantee rather than a filter someone can
 * forget to apply, and it also keeps buckets small.
 *
 * The index lives in this JVM only. With several instances running, each builds its own view of
 * whatever it has seen locally; Redis (L2) is what they actually share, and it only serves exact
 * identity hits. Semantic hit rate therefore warms up per instance.
 */
public class LshIndex {

    private final RandomHyperplaneLsh lsh;

    private final Map<String, Map<Long, Set<String>>[]> tablesByOrg = new ConcurrentHashMap<>();
    private final Map<String, long[]> signaturesByKey = new ConcurrentHashMap<>();

    public LshIndex(RandomHyperplaneLsh lsh) {
        this.lsh = lsh;
    }

    public void add(String orgId, String cacheKey, float[] embedding) {
        long[] signatures = lsh.signatures(embedding);
        Map<Long, Set<String>>[] tables = tablesFor(orgId);

        for (int t = 0; t < signatures.length; t++) {
            tables[t].computeIfAbsent(signatures[t], k -> ConcurrentHashMap.newKeySet()).add(cacheKey);
        }
        signaturesByKey.put(indexKey(orgId, cacheKey), signatures);
    }

    public void remove(String orgId, String cacheKey) {
        long[] signatures = signaturesByKey.remove(indexKey(orgId, cacheKey));
        if (signatures == null) {
            return;
        }

        Map<Long, Set<String>>[] tables = tablesByOrg.get(orgId);
        if (tables == null) {
            return;
        }

        for (int t = 0; t < signatures.length; t++) {
            Set<String> bucket = tables[t].get(signatures[t]);
            if (bucket != null) {
                bucket.remove(cacheKey);
                if (bucket.isEmpty()) {
                    tables[t].remove(signatures[t], bucket);
                }
            }
        }
    }

    /**
     * Union of the buckets this embedding falls into across all tables, capped so one hot bucket
     * cannot turn a lookup into a scan. Insertion order is preserved so the cap keeps candidates
     * from the earlier (equally valid) tables rather than an arbitrary subset.
     */
    public Set<String> candidates(String orgId, float[] embedding, int limit) {
        Map<Long, Set<String>>[] tables = tablesByOrg.get(orgId);
        if (tables == null) {
            return Set.of();
        }

        long[] signatures = lsh.signatures(embedding);
        Set<String> candidates = new LinkedHashSet<>();

        for (int t = 0; t < signatures.length && candidates.size() < limit; t++) {
            Set<String> bucket = tables[t].get(signatures[t]);
            if (bucket == null) {
                continue;
            }
            for (String key : bucket) {
                candidates.add(key);
                if (candidates.size() >= limit) {
                    break;
                }
            }
        }

        return Collections.unmodifiableSet(candidates);
    }

    public void clear(String orgId) {
        tablesByOrg.remove(orgId);
        signaturesByKey.keySet().removeIf(key -> key.startsWith(orgId + "\u0000"));
    }

    public void clearAll() {
        tablesByOrg.clear();
        signaturesByKey.clear();
    }

    public int indexedEntries() {
        return signaturesByKey.size();
    }

    @SuppressWarnings("unchecked")
    private Map<Long, Set<String>>[] tablesFor(String orgId) {
        return tablesByOrg.computeIfAbsent(orgId, id -> {
            Map<Long, Set<String>>[] tables = new ConcurrentHashMap[lsh.tables()];
            for (int t = 0; t < tables.length; t++) {
                tables[t] = new ConcurrentHashMap<>();
            }
            return tables;
        });
    }

    private static String indexKey(String orgId, String cacheKey) {
        return orgId + "\u0000" + cacheKey;
    }
}
