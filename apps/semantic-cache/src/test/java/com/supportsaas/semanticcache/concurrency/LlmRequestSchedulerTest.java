package com.supportsaas.semanticcache.concurrency;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import com.supportsaas.semanticcache.scheduler.LlmRequestScheduler;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LlmRequestSchedulerTest {

    @Test
    void grantsUpToTheConcurrencyLimitImmediately() {
        LlmRequestScheduler scheduler = new LlmRequestScheduler(2, 10, 1_000, 1_000);

        assertThat(scheduler.acquire(0).join()).isTrue();
        assertThat(scheduler.acquire(0).join()).isTrue();
        assertThat(scheduler.activeSlots()).isEqualTo(2);
    }

    @Test
    void queuesRequestsPastTheLimit() {
        LlmRequestScheduler scheduler = new LlmRequestScheduler(1, 10, 5_000, 5_000);
        scheduler.acquire(0).join();

        CompletableFuture<Boolean> queued = scheduler.acquire(0);

        assertThat(queued.isDone()).isFalse();
        assertThat(scheduler.queueDepth()).isEqualTo(1);
    }

    @Test
    void releasingASlotAdmitsTheNextWaiter() throws Exception {
        LlmRequestScheduler scheduler = new LlmRequestScheduler(1, 10, 5_000, 5_000);
        scheduler.acquire(0).join();

        CompletableFuture<Boolean> queued = scheduler.acquire(0);
        scheduler.release();

        assertThat(queued.get(2, TimeUnit.SECONDS)).isTrue();
        assertThat(scheduler.queueDepth()).isZero();
    }

    @Test
    void higherPriorityIsAdmittedFirst() throws Exception {
        LlmRequestScheduler scheduler = new LlmRequestScheduler(1, 10, 5_000, 60_000);
        scheduler.acquire(0).join();

        CompletableFuture<Boolean> low = scheduler.acquire(1);
        CompletableFuture<Boolean> high = scheduler.acquire(9);

        scheduler.release();

        assertThat(high.get(2, TimeUnit.SECONDS)).isTrue();
        assertThat(low.isDone()).isFalse();
    }

    @Test
    void agingLetsALongWaiterOvertakeNewArrivals() throws Exception {
        LlmRequestScheduler scheduler = new LlmRequestScheduler(1, 10, 5_000, 10);
        scheduler.acquire(0).join();

        CompletableFuture<Boolean> old = scheduler.acquire(0);
        Thread.sleep(60);
        scheduler.ageWaiters();

        CompletableFuture<Boolean> fresh = scheduler.acquire(0);
        scheduler.release();

        assertThat(old.get(2, TimeUnit.SECONDS)).isTrue();
        assertThat(fresh.isDone()).isFalse();
    }

    @Test
    void afullQueueLetsCallersThroughUnscheduledRatherThanFailing() {
        LlmRequestScheduler scheduler = new LlmRequestScheduler(1, 1, 5_000, 5_000);
        scheduler.acquire(0).join();
        scheduler.acquire(0);

        assertThat(scheduler.acquire(0).join())
                .as("cache backpressure must never stop the AI pipeline")
                .isFalse();
        assertThat(scheduler.rejectedCount()).isEqualTo(1);
    }

    @Test
    void waiterThatTimesOutProceedsUnscheduledAndLeavesTheQueue() throws Exception {
        LlmRequestScheduler scheduler = new LlmRequestScheduler(1, 10, 100, 60_000);
        scheduler.acquire(0).join();

        CompletableFuture<Boolean> queued = scheduler.acquire(0);

        assertThat(queued.get(3, TimeUnit.SECONDS)).isFalse();
        assertThat(scheduler.queueDepth()).isZero();
    }

    @Test
    void aTimedOutWaiterDoesNotConsumeASlotOnRelease() throws Exception {
        LlmRequestScheduler scheduler = new LlmRequestScheduler(1, 10, 100, 60_000);
        scheduler.acquire(0).join();

        CompletableFuture<Boolean> abandoned = scheduler.acquire(0);
        assertThat(abandoned.get(3, TimeUnit.SECONDS)).isFalse();

        scheduler.release();

        assertThat(scheduler.activeSlots()).isZero();
        assertThat(scheduler.acquire(0).join()).isTrue();
    }

    @Test
    void releasesBeyondTheGrantedCountAreIgnored() {
        LlmRequestScheduler scheduler = new LlmRequestScheduler(2, 10, 1_000, 1_000);
        scheduler.release();
        scheduler.release();

        assertThat(scheduler.activeSlots()).isZero();

        List<CompletableFuture<Boolean>> granted = new ArrayList<>();
        granted.add(scheduler.acquire(0));
        granted.add(scheduler.acquire(0));

        assertThat(granted).allSatisfy(f -> assertThat(f.join()).isTrue());
    }
}
