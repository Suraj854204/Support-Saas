package com.supportsaas.semanticcache.service;

import java.time.Duration;
import java.util.Set;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.supportsaas.semanticcache.config.CacheProperties;
import com.supportsaas.semanticcache.metrics.CacheMetrics;
import com.supportsaas.semanticcache.model.CacheEntry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * L2: the Redis instance the rest of the platform already runs on.
 *
 * L1 is per-JVM, so this is what lets a second instance serve an answer the first one generated.
 * It only serves exact-identity hits — the semantic index is local to each JVM, which is the
 * honest limit of this design and is documented in the README rather than papered over.
 *
 * Every method swallows its failures. A Redis outage has to degrade the platform to "same
 * behaviour as before the cache existed", never to an error the customer sees.
 */
@Component
public class RedisCacheStore {

    private static final Logger log = LoggerFactory.getLogger(RedisCacheStore.class);

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final CacheProperties properties;
    private final CacheMetrics metrics;

    public RedisCacheStore(StringRedisTemplate redis, ObjectMapper objectMapper,
                           CacheProperties properties, CacheMetrics metrics) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.metrics = metrics;
    }

    public CacheEntry get(String orgId, String cacheKey) {
        if (!properties.isRedisEnabled()) {
            return null;
        }
        try {
            String payload = redis.opsForValue().get(entryKey(orgId, cacheKey));
            return payload == null ? null : objectMapper.readValue(payload, CacheEntry.class);
        } catch (Exception e) {
            degrade("read", e);
            return null;
        }
    }

    public void put(CacheEntry entry, String cacheKey) {
        if (!properties.isRedisEnabled()) {
            return;
        }
        try {
            String key = entryKey(entry.getOrgId(), cacheKey);
            String payload = objectMapper.writeValueAsString(entry);

            Duration ttl = Duration.ofSeconds(properties.getTtlSeconds());
            redis.opsForValue().set(key, payload, ttl);

            // Membership set so an org-wide invalidation does not need a SCAN over the whole
            // keyspace. It carries a slightly longer TTL so it outlives the entries it tracks.
            String index = orgIndexKey(entry.getOrgId());
            redis.opsForSet().add(index, key);
            redis.expire(index, ttl.plusHours(1));
        } catch (Exception e) {
            degrade("write", e);
        }
    }

    public void invalidateOrg(String orgId) {
        if (!properties.isRedisEnabled()) {
            return;
        }
        try {
            String index = orgIndexKey(orgId);
            Set<String> keys = redis.opsForSet().members(index);
            if (keys != null && !keys.isEmpty()) {
                redis.delete(keys);
            }
            redis.delete(index);
        } catch (Exception e) {
            degrade("invalidate", e);
        }
    }

    public boolean isHealthy() {
        if (!properties.isRedisEnabled()) {
            return false;
        }
        try {
            redis.hasKey(properties.getRedisKeyPrefix() + ":health");
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String entryKey(String orgId, String cacheKey) {
        return properties.getRedisKeyPrefix() + ":entry:" + orgId + ":" + cacheKey;
    }

    private String orgIndexKey(String orgId) {
        return properties.getRedisKeyPrefix() + ":org:" + orgId + ":keys";
    }

    /** Message only — no keys, no payloads, nothing that could carry customer text into the logs. */
    private void degrade(String operation, Exception e) {
        metrics.recordError();
        log.warn("Redis {} failed, continuing without L2: {}", operation, e.getMessage());
    }
}
