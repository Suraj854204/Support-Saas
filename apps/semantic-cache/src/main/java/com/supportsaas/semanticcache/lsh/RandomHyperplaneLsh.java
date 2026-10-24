package com.supportsaas.semanticcache.lsh;

import java.util.Random;

/**
 * Random hyperplane LSH for cosine distance.
 *
 * Each table owns a set of random hyperplanes. For a vector we record which side of each plane
 * it falls on; the resulting bit string is the bucket key. Two vectors collide on one bit with
 * probability 1 - theta/pi, so vectors pointing in similar directions land in the same bucket
 * far more often than unrelated ones.
 *
 * This is a candidate generator, not a nearest-neighbour search. Buckets can miss a genuine
 * neighbour (which costs a cache miss) and can contain unrelated entries (which the exact
 * cosine check downstream throws out). More tables raise recall and memory; more hyperplanes
 * per table narrow each bucket and lower recall.
 *
 * The planes are built from a fixed seed so a restarted instance rebuilds the same geometry
 * and tests are reproducible.
 */
public class RandomHyperplaneLsh {

    private final int tables;
    private final int hyperplanes;
    private final int dimension;
    private final float[][][] planes;

    public RandomHyperplaneLsh(int tables, int hyperplanes, int dimension, long seed) {
        if (tables <= 0 || hyperplanes <= 0 || hyperplanes > 63 || dimension <= 0) {
            throw new IllegalArgumentException("invalid LSH configuration");
        }

        this.tables = tables;
        this.hyperplanes = hyperplanes;
        this.dimension = dimension;
        this.planes = new float[tables][hyperplanes][dimension];

        Random random = new Random(seed);
        for (int t = 0; t < tables; t++) {
            for (int h = 0; h < hyperplanes; h++) {
                for (int d = 0; d < dimension; d++) {
                    planes[t][h][d] = (float) random.nextGaussian();
                }
            }
        }
    }

    public int tables() {
        return tables;
    }

    public int hyperplanes() {
        return hyperplanes;
    }

    public int dimension() {
        return dimension;
    }

    /** One bucket key per table. Packed into a long because hyperplanes is capped at 63. */
    public long[] signatures(float[] vector) {
        if (vector.length != dimension) {
            throw new IllegalArgumentException(
                    "embedding dimension " + vector.length + " does not match configured " + dimension);
        }

        long[] result = new long[tables];
        for (int t = 0; t < tables; t++) {
            long signature = 0;
            for (int h = 0; h < hyperplanes; h++) {
                if (dot(planes[t][h], vector) >= 0) {
                    signature |= 1L << h;
                }
            }
            result[t] = signature;
        }
        return result;
    }

    private static double dot(float[] plane, float[] vector) {
        double sum = 0;
        for (int i = 0; i < vector.length; i++) {
            sum += (double) plane[i] * vector[i];
        }
        return sum;
    }
}
