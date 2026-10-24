package com.supportsaas.semanticcache.similarity;

import java.text.Normalizer;
import java.util.regex.Pattern;

/**
 * Normalisation applied before a query becomes part of a cache key.
 *
 * Deliberately conservative. Anything that changes meaning — error codes, order numbers, product
 * names, dates, negations — has to survive untouched, because "Error 401 while logging in" and
 * "Error 500 while logging in" must not collapse onto the same key. So this only removes
 * differences that are genuinely cosmetic: Unicode representation, whitespace layout, case, and
 * the trailing punctuation people add inconsistently.
 */
public final class QueryNormalizer {

    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    private static final Pattern TRAILING_PUNCTUATION = Pattern.compile("[\\s.!?]+$");

    private QueryNormalizer() {
    }

    public static String normalize(String query) {
        if (query == null) {
            return "";
        }

        // NFKC folds compatibility variants (full-width characters, ligatures) onto their
        // canonical form so the same question typed on different keyboards hashes the same.
        String normalized = Normalizer.normalize(query, Normalizer.Form.NFKC);

        normalized = WHITESPACE.matcher(normalized).replaceAll(" ").trim();
        normalized = normalized.toLowerCase(java.util.Locale.ROOT);
        normalized = TRAILING_PUNCTUATION.matcher(normalized).replaceAll("");

        return normalized;
    }
}
