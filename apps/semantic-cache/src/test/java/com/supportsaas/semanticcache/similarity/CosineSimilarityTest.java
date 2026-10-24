package com.supportsaas.semanticcache.similarity;

import com.supportsaas.semanticcache.similarity.CosineSimilarity;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CosineSimilarityTest {

    @Test
    void identicalVectorsScoreOne() {
        float[] v = { 1, 2, 3, 4 };
        assertThat(CosineSimilarity.between(v, v.clone())).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-9));
    }

    @Test
    void orthogonalVectorsScoreZero() {
        assertThat(CosineSimilarity.between(new float[] { 1, 0 }, new float[] { 0, 1 }))
                .isCloseTo(0.0, org.assertj.core.data.Offset.offset(1e-9));
    }

    @Test
    void oppositeVectorsScoreMinusOne() {
        assertThat(CosineSimilarity.between(new float[] { 1, 2 }, new float[] { -1, -2 }))
                .isCloseTo(-1.0, org.assertj.core.data.Offset.offset(1e-9));
    }

    @Test
    void zeroVectorScoresZeroRatherThanNaN() {
        assertThat(CosineSimilarity.between(new float[] { 0, 0 }, new float[] { 1, 1 })).isZero();
    }

    @Test
    void mismatchedOrNullInputsScoreZero() {
        assertThat(CosineSimilarity.between(new float[] { 1, 2 }, new float[] { 1, 2, 3 })).isZero();
        assertThat(CosineSimilarity.between(null, new float[] { 1 })).isZero();
        assertThat(CosineSimilarity.between(new float[0], new float[0])).isZero();
    }

    @Test
    void magnitudeDoesNotAffectDirection() {
        double score = CosineSimilarity.between(new float[] { 1, 1 }, new float[] { 50, 50 });
        assertThat(score).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-9));
    }

    @Test
    void neverExceedsTheValidRange() {
        float[] v = { 0.577f, 0.577f, 0.577f };
        double score = CosineSimilarity.between(v, v.clone());
        assertThat(score).isBetween(-1.0, 1.0);
    }

    @Test
    void normalizeProducesUnitLength() {
        float[] normalized = CosineSimilarity.normalize(new float[] { 3, 4 });

        double length = Math.sqrt(normalized[0] * normalized[0] + normalized[1] * normalized[1]);
        assertThat(length).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-6));
    }
}
