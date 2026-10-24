package com.supportsaas.semanticcache.concurrency;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Collapses concurrent identical cache misses onto one downstream execution.
 *
 * When fifty customers ask the same thing in the same second, the first miss becomes the owner
 * and runs RAG + LLM; the other forty-nine park on the owner's CompletableFuture and are served
 * the owner's answer when it lands. The keyspace is the exact cache identity, so coalescing can
 * never merge two different questions or two different tenants.
 *
 * Every future gets a timeout. If the owner dies, hangs, or its process is killed mid-flight,
 * the waiters fail fast and fall through to running the pipeline themselves — a stuck owner
 * degrades throughput, it does not hang the platform. The whenComplete hook removes the entry on
 * every outcome (success, failure, timeout) so nothing is left behind in the map.
 *
 * Coalescing is per JVM. With several instances behind a load balancer the worst case is one
 * execution per instance, not one per request.
 */
public class RequestCoalescer {

    /** owner=true means this caller must produce the answer and call complete()/fail(). */
    public record Slot(boolean owner, String leaseId, CompletableFuture<String> result) {
    }

    private record InFlight(String leaseId, String key, CompletableFuture<String> future, long startedAt) {
    }

    private final Map<String, InFlight> byKey = new ConcurrentHashMap<>();
    private final Map<String, InFlight> byLease = new ConcurrentHashMap<>();
    private final long timeoutMs;

    public RequestCoalescer(long timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    public Slot begin(String key) {
        InFlight created = new InFlight(UUID.randomUUID().toString(), key, new CompletableFuture<>(),
                System.currentTimeMillis());

        InFlight existing = byKey.putIfAbsent(key, created);
        if (existing != null) {
            return new Slot(false, null, existing.future());
        }

        byLease.put(created.leaseId(), created);

        created.future()
                .orTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .whenComplete((value, error) -> {
                    byKey.remove(key, created);
                    byLease.remove(created.leaseId());
                });

        return new Slot(true, created.leaseId(), created.future());
    }

    /** Hands the owner's answer to everyone waiting on it. */
    public boolean complete(String leaseId, String response) {
        InFlight inFlight = byLease.get(leaseId);
        if (inFlight == null) {
            return false;
        }
        return inFlight.future().complete(response);
    }

    /** Owner could not produce an answer. Waiters wake up and run the pipeline themselves. */
    public void fail(String leaseId, String reason) {
        InFlight inFlight = byLease.get(leaseId);
        if (inFlight != null) {
            inFlight.future().completeExceptionally(new TimeoutException(reason));
        }
    }

    public int inFlightCount() {
        return byKey.size();
    }

    public void clear() {
        byKey.values().forEach(inFlight ->
                inFlight.future().completeExceptionally(new TimeoutException("cache cleared")));
        byKey.clear();
        byLease.clear();
    }
}
