package com.supportsaas.semanticcache.similarity;

/**
 * cosine(a, b) = dot(a, b) / (norm(a) * norm(b))
 *
 * Embedding vectors from most providers are already unit length, but we never assume that —
 * an un-normalised vector would silently inflate every score and push false positives through
 * the threshold check.
 */
public final class CosineSimilarity {

    private CosineSimilarity() {
    }

    public static double between(float[] a, float[] b) {
        if (a == null || b == null || a.length != b.length || a.length == 0) {
            return 0.0;
        }

        double dot = 0;
        double normA = 0;
        double normB = 0;

        for (int i = 0; i < a.length; i++) {
            dot += (double) a[i] * b[i];
            normA += (double) a[i] * a[i];
            normB += (double) b[i] * b[i];
        }

        if (normA == 0 || normB == 0) {
            return 0.0;
        }

        double similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));

        // Floating point can push an identical pair a hair past 1.0.
        return Math.max(-1.0, Math.min(1.0, similarity));
    }

    public static float[] normalize(float[] vector) {
        double norm = 0;
        for (float value : vector) {
            norm += (double) value * value;
        }
        if (norm == 0) {
            return vector.clone();
        }

        double length = Math.sqrt(norm);
        float[] result = new float[vector.length];
        for (int i = 0; i < vector.length; i++) {
            result[i] = (float) (vector[i] / length);
        }
        return result;
    }
}
