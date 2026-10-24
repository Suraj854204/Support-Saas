package com.supportsaas.semanticcache.lsh;

import java.util.Random;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LshIndexTest {

    private static final int DIMENSION = 64;

    private LshIndex newIndex() {
        return new LshIndex(new RandomHyperplaneLsh(8, 12, DIMENSION, 42));
    }

    @Test
    void signaturesAreDeterministic() {
        RandomHyperplaneLsh lsh = new RandomHyperplaneLsh(4, 8, DIMENSION, 7);
        float[] vector = randomVector(new Random(1));

        assertThat(lsh.signatures(vector)).isEqualTo(lsh.signatures(vector));
    }

    @Test
    void sameSeedProducesSameGeometry() {
        float[] vector = randomVector(new Random(2));

        assertThat(new RandomHyperplaneLsh(4, 8, DIMENSION, 99).signatures(vector))
                .isEqualTo(new RandomHyperplaneLsh(4, 8, DIMENSION, 99).signatures(vector));
    }

    @Test
    void rejectsWrongDimension() {
        RandomHyperplaneLsh lsh = new RandomHyperplaneLsh(4, 8, DIMENSION, 42);

        assertThatThrownBy(() -> lsh.signatures(new float[DIMENSION + 1]))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void nearbyVectorsCollideFarMoreOftenThanUnrelatedOnes() {
        RandomHyperplaneLsh lsh = new RandomHyperplaneLsh(16, 10, DIMENSION, 42);
        Random random = new Random(5);

        int nearCollisions = 0;
        int farCollisions = 0;
        int trials = 200;

        for (int i = 0; i < trials; i++) {
            float[] base = randomVector(random);
            float[] near = perturb(base, 0.05f, random);
            float[] far = randomVector(random);

            nearCollisions += sharedBuckets(lsh, base, near);
            farCollisions += sharedBuckets(lsh, base, far);
        }

        assertThat(nearCollisions).isGreaterThan(farCollisions * 3);
    }

    @Test
    void returnsTheEntryItIndexed() {
        LshIndex index = newIndex();
        float[] vector = randomVector(new Random(11));

        index.add("org_a", "key-1", vector);

        assertThat(index.candidates("org_a", vector, 10)).contains("key-1");
    }

    @Test
    void neverReturnsAnotherOrgsEntries() {
        LshIndex index = newIndex();
        float[] vector = randomVector(new Random(12));

        index.add("org_a", "key-a", vector);
        index.add("org_b", "key-b", vector);

        assertThat(index.candidates("org_a", vector, 10)).containsExactly("key-a");
        assertThat(index.candidates("org_b", vector, 10)).containsExactly("key-b");
    }

    @Test
    void unknownOrgReturnsNothing() {
        assertThat(newIndex().candidates("org_missing", randomVector(new Random(13)), 10)).isEmpty();
    }

    @Test
    void removedEntriesStopAppearing() {
        LshIndex index = newIndex();
        float[] vector = randomVector(new Random(14));

        index.add("org_a", "key-1", vector);
        index.remove("org_a", "key-1");

        assertThat(index.candidates("org_a", vector, 10)).isEmpty();
        assertThat(index.indexedEntries()).isZero();
    }

    @Test
    void candidateCountIsCapped() {
        LshIndex index = new LshIndex(new RandomHyperplaneLsh(8, 2, DIMENSION, 42));
        float[] vector = randomVector(new Random(15));

        for (int i = 0; i < 200; i++) {
            index.add("org_a", "key-" + i, perturb(vector, 0.01f, new Random(i)));
        }

        assertThat(index.candidates("org_a", vector, 25)).hasSizeLessThanOrEqualTo(25);
    }

    @Test
    void clearingOneOrgLeavesOthersAlone() {
        LshIndex index = newIndex();
        float[] vector = randomVector(new Random(16));

        index.add("org_a", "key-a", vector);
        index.add("org_b", "key-b", vector);
        index.clear("org_a");

        assertThat(index.candidates("org_a", vector, 10)).isEmpty();
        assertThat(index.candidates("org_b", vector, 10)).containsExactly("key-b");
    }

    private static int sharedBuckets(RandomHyperplaneLsh lsh, float[] a, float[] b) {
        long[] left = lsh.signatures(a);
        long[] right = lsh.signatures(b);

        int shared = 0;
        for (int i = 0; i < left.length; i++) {
            if (left[i] == right[i]) {
                shared++;
            }
        }
        return shared;
    }

    private static float[] randomVector(Random random) {
        float[] vector = new float[DIMENSION];
        for (int i = 0; i < DIMENSION; i++) {
            vector[i] = (float) random.nextGaussian();
        }
        return vector;
    }

    private static float[] perturb(float[] base, float scale, Random random) {
        float[] result = base.clone();
        for (int i = 0; i < result.length; i++) {
            result[i] += (float) random.nextGaussian() * scale;
        }
        return result;
    }
}
