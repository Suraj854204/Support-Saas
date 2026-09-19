
package com.supportsaas.semanticcache.concurrency;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RequestCoalescerTest {

    @Test
    void firstCallerOwnsTheKeyAndTheRestJoin() {
        RequestCoalescer coalescer = new RequestCoalescer(5_000);

        RequestCoalescer.Slot owner = coalescer.begin("k");
        RequestCoalescer.Slot joiner = coalescer.begin("k");

        assertThat(owner.owner()).isTrue();
        assertThat(owner.leaseId()).isNotBlank();
        assertThat(joiner.owner()).isFalse();
        assertThat(joiner.leaseId()).isNull();
    }

    @Test
    void differentKeysGetTheirOwnOwners() {
        RequestCoalescer coalescer = new RequestCoalescer(5_000);

        assertThat(coalescer.begin("a").owner()).isTrue();
        assertThat(coalescer.begin("b").owner()).isTrue();
        assertThat(coalescer.inFlightCount()).isEqualTo(2);
    }

    @Test
    void ownerResultIsDeliveredToEveryWaiter() throws Exception {
        RequestCoalescer coalescer = new RequestCoalescer(5_000);

        RequestCoalescer.Slot owner = coalescer.begin("k");

        List<CompletableFuture<String>> waiters = List.of(
                coalescer.begin("k").result(),
                coalescer.begin("k").result(),
                coalescer.begin("k").result()
        );

        coalescer.complete(owner.leaseId(), "answer");

        for (CompletableFuture<String> waiter : waiters) {
            assertThat(waiter.get(2, TimeUnit.SECONDS))
                    .isEqualTo("answer");
        }
    }

    @Test
    void oneHundredConcurrentIdenticalRequestsProduceOneOwner() throws Exception {
        RequestCoalescer coalescer = new RequestCoalescer(10_000);
        int callers = 100;

        /*
         * Use one thread per caller so all 100 callers can reach
         * coalescer.begin() before the owner is allowed to finish.
         */
        ExecutorService pool = Executors.newFixedThreadPool(callers);

        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch begun = new CountDownLatch(callers);
        CountDownLatch releaseOwner = new CountDownLatch(1);

        AtomicInteger owners = new AtomicInteger();
        AtomicInteger served = new AtomicInteger();

        for (int i = 0; i < callers; i++) {
            pool.submit(() -> {
                try {
                    // Start all callers together.
                    start.await();

                    RequestCoalescer.Slot slot =
                            coalescer.begin("same-query");

                    if (slot.owner()) {
                        owners.incrementAndGet();
                    }

                    /*
                     * Important:
                     * Signal that this caller has already executed begin().
                     */
                    begun.countDown();

                    /*
                     * The owner waits here.
                     *
                     * This prevents the first owner from completing and
                     * removing the key before all 100 callers have called
                     * begin().
                     */
                    if (slot.owner()) {
                        releaseOwner.await();

                        coalescer.complete(
                                slot.leaseId(),
                                "generated-once"
                        );
                    }

                    /*
                     * Owner and all joiners wait for the same future.
                     */
                    if ("generated-once".equals(
                            slot.result().get(5, TimeUnit.SECONDS))) {

                        served.incrementAndGet();
                    }

                } catch (Exception e) {
                    Thread.currentThread().interrupt();

                } finally {
                    // No done latch is required because we wait for
                    // executor termination below.
                }
            });
        }

        // Release all callers.
        start.countDown();

        /*
         * Wait until all 100 callers have executed begin().
         */
        assertThat(begun.await(20, TimeUnit.SECONDS))
                .as("all callers should reach begin()")
                .isTrue();

        /*
         * Because every caller has already executed begin() while the
         * original entry was still in-flight, exactly one must be owner.
         */
        assertThat(owners.get())
                .as("only one caller should run the expensive work")
                .isEqualTo(1);

        /*
         * Now allow the owner to complete the expensive operation.
         */
        releaseOwner.countDown();

        pool.shutdown();

        assertThat(pool.awaitTermination(20, TimeUnit.SECONDS))
                .as("all callers should finish")
                .isTrue();

        /*
         * Every caller must receive the same cached/generated response.
         */
        assertThat(served.get())
                .as("all callers should receive the generated response")
                .isEqualTo(callers);
    }

    @Test
    void inFlightEntryIsRemovedAfterCompletion() {
        RequestCoalescer coalescer = new RequestCoalescer(5_000);

        RequestCoalescer.Slot owner = coalescer.begin("k");

        coalescer.complete(owner.leaseId(), "answer");

        assertThat(coalescer.inFlightCount()).isZero();

        assertThat(coalescer.begin("k").owner())
                .as("key is free again")
                .isTrue();
    }

    @Test
    void failedOwnerWakesWaitersWithAnError() {
        RequestCoalescer coalescer = new RequestCoalescer(5_000);

        RequestCoalescer.Slot owner = coalescer.begin("k");

        CompletableFuture<String> waiter =
                coalescer.begin("k").result();

        coalescer.fail(owner.leaseId(), "llm exploded");

        assertThatThrownBy(
                () -> waiter.get(2, TimeUnit.SECONDS)
        ).hasMessageContaining("llm exploded");

        assertThat(coalescer.inFlightCount()).isZero();
    }

    @Test
    void abandonedOwnerTimesOutInsteadOfHangingForever() {
        RequestCoalescer coalescer = new RequestCoalescer(150);

        RequestCoalescer.Slot owner = coalescer.begin("k");

        CompletableFuture<String> waiter =
                coalescer.begin("k").result();

        assertThatThrownBy(
                () -> waiter.get(3, TimeUnit.SECONDS)
        ).isNotNull();

        assertThat(coalescer.inFlightCount()).isZero();

        assertThat(
                coalescer.complete(owner.leaseId(), "too late")
        ).isFalse();
    }

    @Test
    void completingAnUnknownLeaseIsIgnored() {
        RequestCoalescer coalescer = new RequestCoalescer(5_000);

        assertThat(
                coalescer.complete("no-such-lease", "x")
        ).isFalse();
    }
}
