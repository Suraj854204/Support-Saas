package com.supportsaas.semanticcache.bloom;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BloomFilterTest {

    @Test
    void reportsEverythingItWasGiven() {
        BloomFilter filter = new BloomFilter(1_000, 0.01);

        for (int i = 0; i < 1_000; i++) {
            filter.add("key-" + i);
        }
        for (int i = 0; i < 1_000; i++) {
            assertThat(filter.mightContain("key-" + i))
                    .as("false negatives would make the cache skip real entries")
                    .isTrue();
        }
    }

    @Test
    void rejectsValuesItHasNeverSeen() {
        BloomFilter filter = new BloomFilter(1_000, 0.01);
        filter.add("stored");

        assertThat(filter.mightContain("never-stored")).isFalse();
    }

    @Test
    void emptyFilterRejectsEverything() {
        BloomFilter filter = new BloomFilter(100, 0.01);
        assertThat(filter.mightContain("anything")).isFalse();
    }

    @Test
    void falsePositiveRateStaysNearTheConfiguredTarget() {
        int expected = 10_000;
        double target = 0.01;
        BloomFilter filter = new BloomFilter(expected, target);

        for (int i = 0; i < expected; i++) {
            filter.add("member-" + i);
        }

        int falsePositives = 0;
        int probes = 20_000;
        for (int i = 0; i < probes; i++) {
            if (filter.mightContain("absent-" + i)) {
                falsePositives++;
            }
        }

        // Generous ceiling: this asserts the sizing maths is right, not an exact rate.
        assertThat((double) falsePositives / probes).isLessThan(target * 3);
    }

    @Test
    void sizesBitsAndHashesFromTheConfiguration() {
        BloomFilter filter = new BloomFilter(10_000, 0.01);

        assertThat(filter.bitCount()).isGreaterThan(10_000);
        assertThat(filter.hashCount()).isBetween(5, 9);
    }

    @Test
    void clearResetsMembership() {
        BloomFilter filter = new BloomFilter(100, 0.01);
        filter.add("a");
        filter.clear();

        assertThat(filter.mightContain("a")).isFalse();
        assertThat(filter.insertionCount()).isZero();
    }

    @Test
    void rejectsInvalidConfiguration() {
        assertThatThrownBy(() -> new BloomFilter(0, 0.01)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BloomFilter(100, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BloomFilter(100, 1)).isInstanceOf(IllegalArgumentException.class);
    }
}
