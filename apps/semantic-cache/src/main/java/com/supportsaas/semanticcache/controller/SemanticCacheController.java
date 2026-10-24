package com.supportsaas.semanticcache.controller;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

import com.supportsaas.semanticcache.model.CacheStats;
import com.supportsaas.semanticcache.model.InvalidateRequest;
import com.supportsaas.semanticcache.model.LookupRequest;
import com.supportsaas.semanticcache.model.LookupResponse;
import com.supportsaas.semanticcache.model.StoreRequest;
import com.supportsaas.semanticcache.service.SemanticCacheService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lookup returns a CompletableFuture so Spring MVC releases the servlet thread while a coalesced
 * request waits for the owner's answer. Blocking here would let one slow LLM call tie up the
 * whole thread pool.
 *
 * Unexpected failures are turned into a miss rather than an error: the AI service falls back to
 * its normal RAG + LLM path, which is exactly what should happen when the cache is unhealthy.
 */
@RestController
@RequestMapping("/api/v1/cache")
public class SemanticCacheController {

    private static final Logger log = LoggerFactory.getLogger(SemanticCacheController.class);

    private final SemanticCacheService cache;

    public SemanticCacheController(SemanticCacheService cache) {
        this.cache = cache;
    }

    @PostMapping("/lookup")
    public CompletableFuture<LookupResponse> lookup(@Valid @RequestBody LookupRequest request) {
        return cache.lookup(request)
                .exceptionally(error -> {
                    log.warn("Lookup failed, reporting a miss: {}", error.getMessage());
                    return LookupResponse.miss("CACHE_ERROR", null);
                });
    }

    @PostMapping("/store")
    public ResponseEntity<Map<String, Object>> store(@Valid @RequestBody StoreRequest request) {
        cache.store(request);
        return ResponseEntity.ok(Map.of("stored", true));
    }

    /** Called when the owner of a coalesced miss could not produce an answer. */
    @PostMapping("/release")
    public ResponseEntity<Map<String, Object>> release(@RequestParam String leaseId,
                                                       @RequestParam(required = false) String reason) {
        cache.release(leaseId, reason);
        return ResponseEntity.ok(Map.of("released", true));
    }

    @PostMapping("/invalidate")
    public ResponseEntity<Map<String, Object>> invalidate(@Valid @RequestBody InvalidateRequest request) {
        String version = cache.invalidateOrg(request.orgId(), request.bumpKbVersion());
        return ResponseEntity.ok(Map.of("invalidated", true, "kbVersion", version));
    }

    @PostMapping("/clear")
    public ResponseEntity<Map<String, Object>> clear() {
        cache.clearAll();
        return ResponseEntity.ok(Map.of("cleared", true));
    }

    @org.springframework.web.bind.annotation.GetMapping("/stats")
    public CacheStats stats() {
        return cache.stats();
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
    }
}
