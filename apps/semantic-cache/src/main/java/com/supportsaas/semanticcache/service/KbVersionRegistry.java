package com.supportsaas.semanticcache.service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.supportsaas.semanticcache.config.CacheProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Per-org knowledge base version.
 *
 * This is the correctness backstop for RAG caching. An answer generated against yesterday's KB
 * can be flatly wrong after an article is edited, and no similarity score will tell you that.
 * The version is part of the cache identity, so bumping it makes every prior answer for that org
 * unreachable in one operation — no scanning, no partial invalidation.
 *
 * Redis holds it so all instances agree. The local map is a fallback for a Redis outage; it is
 * per-instance and can lag, which is safe in the direction that matters (an instance that missed
 * a bump keeps serving its own consistent view and expires entries on TTL).
 */
@Component
public class KbVersionRegistry {

    private static final Logger log = LoggerFactory.getLogger(KbVersionRegistry.class);

    private final StringRedisTemplate redis;
    private final CacheProperties properties;
    private final Map<String, Long> localVersions = new ConcurrentHashMap<>();

    public KbVersionRegistry(StringRedisTemplate redis, CacheProperties properties) {
        this.redis = redis;
        this.properties = properties;
    }

    public String currentVersion(String orgId) {
        if (properties.isRedisEnabled()) {
            try {
                String value = redis.opsForValue().get(key(orgId));
                if (value != null) {
                    return value;
                }
            } catch (Exception e) {
                log.warn("Could not read kbVersion from Redis, using local value: {}", e.getMessage());
            }
        }
        return String.valueOf(localVersions.getOrDefault(orgId, 0L));
    }

    public String bump(String orgId) {
        long local = localVersions.merge(orgId, 1L, Long::sum);

        if (properties.isRedisEnabled()) {
            try {
                Long value = redis.opsForValue().increment(key(orgId));
                if (value != null) {
                    localVersions.put(orgId, value);
                    return String.valueOf(value);
                }
            } catch (Exception e) {
                log.warn("Could not bump kbVersion in Redis, bumped locally only: {}", e.getMessage());
            }
        }
        return String.valueOf(local);
    }

    private String key(String orgId) {
        return properties.getRedisKeyPrefix() + ":kbversion:" + orgId;
    }
}
