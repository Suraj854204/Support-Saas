package com.supportsaas.semanticcache.scheduler;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Admission control for cache misses that are about to trigger RAG + LLM.
 *
 * A burst of misses would otherwise fan straight out to the provider and collect rate-limit
 * errors. This caps how many run at once and orders the rest by priority, so a paying tenant's
 * ticket is not stuck behind a backlog of low-priority widget traffic.
 *
 * It is deliberately advisory. If the queue is full or a waiter times out, acquire() reports
 * false and the caller proceeds anyway — the cache is an optimisation and must never be the
 * reason a customer gets no answer. What it buys under load is smoothing and ordering, not a
 * hard ceiling.
 *
 * Starvation: java.util.PriorityQueue has no notion of ageing, so a background sweep pulls
 * waiters that have been queued past agingAfterMs, bumps their priority and re-inserts them,
 * which re-heapifies them into a better position. Anything queued long enough eventually
 * outranks new arrivals.
 */
public class LlmRequestScheduler {

    private static final class Waiter {
        final CompletableFuture<Boolean> admitted = new CompletableFuture<>();
        final long enqueuedAt = System.currentTimeMillis();
        int priority;

        Waiter(int priority) {
            this.priority = priority;
        }
    }

    private static final Comparator<Waiter> ORDER = Comparator
            .comparingInt((Waiter w) -> w.priority).reversed()
            .thenComparingLong(w -> w.enqueuedAt);

    private final PriorityQueue<Waiter> queue = new PriorityQueue<>(ORDER);
    private final ReentrantLock lock = new ReentrantLock();

    private final int maxConcurrent;
    private final int maxQueueSize;
    private final long acquireTimeoutMs;
    private final long agingAfterMs;

    private int active;
    private long rejected;
    private long totalWaitMs;
    private long admittedAfterWait;

    public LlmRequestScheduler(int maxConcurrent, int maxQueueSize, long acquireTimeoutMs, long agingAfterMs) {
        this.maxConcurrent = maxConcurrent;
        this.maxQueueSize = maxQueueSize;
        this.acquireTimeoutMs = acquireTimeoutMs;
        this.agingAfterMs = agingAfterMs;
    }

    /** Completes with true when a slot was granted. False means "go ahead unscheduled". */
    public CompletableFuture<Boolean> acquire(int priority) {
        Waiter waiter;

        lock.lock();
        try {
            if (active < maxConcurrent) {
                active++;
                return CompletableFuture.completedFuture(true);
            }
            if (queue.size() >= maxQueueSize) {
                rejected++;
                return CompletableFuture.completedFuture(false);
            }
            waiter = new Waiter(priority);
            queue.add(waiter);
        } finally {
            lock.unlock();
        }

        // On timeout the waiter is simply dropped; dispatch() skips futures it cannot complete.
        return waiter.admitted
                .completeOnTimeout(false, acquireTimeoutMs, TimeUnit.MILLISECONDS)
                .whenComplete((granted, error) -> {
                    if (Boolean.TRUE.equals(granted)) {
                        recordWait(System.currentTimeMillis() - waiter.enqueuedAt);
                    } else {
                        discard(waiter);
                    }
                });
    }

    /** Called when a granted slot is done. Only call this when acquire() completed with true. */
    public void release() {
        lock.lock();
        try {
            if (active > 0) {
                active--;
            }
            dispatch();
        } finally {
            lock.unlock();
        }
    }

    /** Re-queues long-waiting requests at a higher priority so low-priority work still lands. */
    public void ageWaiters() {
        long now = System.currentTimeMillis();
        lock.lock();
        try {
            List<Waiter> aged = new ArrayList<>();
            queue.removeIf(waiter -> {
                if (now - waiter.enqueuedAt >= agingAfterMs) {
                    waiter.priority++;
                    aged.add(waiter);
                    return true;
                }
                return false;
            });
            queue.addAll(aged);
        } finally {
            lock.unlock();
        }
    }

    public int queueDepth() {
        lock.lock();
        try {
            return queue.size();
        } finally {
            lock.unlock();
        }
    }

    public int activeSlots() {
        lock.lock();
        try {
            return active;
        } finally {
            lock.unlock();
        }
    }

    public long rejectedCount() {
        lock.lock();
        try {
            return rejected;
        } finally {
            lock.unlock();
        }
    }

    public long averageWaitMs() {
        lock.lock();
        try {
            return admittedAfterWait == 0 ? 0 : totalWaitMs / admittedAfterWait;
        } finally {
            lock.unlock();
        }
    }

    /** Caller must hold the lock. */
    private void dispatch() {
        while (active < maxConcurrent) {
            Waiter next = queue.poll();
            if (next == null) {
                return;
            }
            // complete() returns false if the waiter already timed out — skip it, do not burn a slot.
            if (next.admitted.complete(true)) {
                active++;
            }
        }
    }

    private void discard(Waiter waiter) {
        lock.lock();
        try {
            queue.remove(waiter);
        } finally {
            lock.unlock();
        }
    }

    private void recordWait(long waitMs) {
        lock.lock();
        try {
            totalWaitMs += waitMs;
            admittedAfterWait++;
        } finally {
            lock.unlock();
        }
    }
}
