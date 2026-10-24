package com.supportsaas.semanticcache.controller;

import java.util.Map;

import com.supportsaas.semanticcache.config.CacheProperties;
import com.supportsaas.semanticcache.service.SemanticCacheService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Mirrors the shape the other services in this repo return from /health, so existing probes and
 * dashboards do not need a special case for this one.
 *
 * Redis being down is reported as degraded, not down: L1 keeps working and lookups still succeed.
 */
@RestController
public class HealthController {

    private final SemanticCacheService cache;
    private final CacheProperties properties;

    public HealthController(SemanticCacheService cache, CacheProperties properties) {
        this.cache = cache;
        this.properties = properties;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        boolean redisUp = cache.redisHealthy();
        return Map.of(
                "status", redisUp || !properties.isRedisEnabled() ? "ok" : "degraded",
                "service", "semantic-cache",
                "enabled", properties.isEnabled(),
                "redis", redisUp ? "connected" : "unavailable",
                "entries", cache.stats().entryCount());
    }
}
