package com.supportsaas.semanticcache.similarity;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class QueryNormalizerTest {

    @Test
    void collapsesWhitespaceAndCase() {
        assertThat(QueryNormalizer.normalize("  How   Do I  RESET my password? "))
                .isEqualTo("how do i reset my password");
    }

    @Test
    void normalizesUnicodeRepresentation() {
        assertThat(QueryNormalizer.normalize("ｒｅｓｅｔ password")).isEqualTo("reset password");
    }

    @Test
    void keepsErrorCodesDistinct() {
        assertThat(QueryNormalizer.normalize("Error 401 while logging in"))
                .isNotEqualTo(QueryNormalizer.normalize("Error 500 while logging in"));
    }

    @Test
    void keepsIdentifiersAndVersionsIntact() {
        assertThat(QueryNormalizer.normalize("Order #A-99213 is late"))
                .isEqualTo("order #a-99213 is late");
    }

    @Test
    void keepsNegationIntact() {
        assertThat(QueryNormalizer.normalize("I cannot log in"))
                .isNotEqualTo(QueryNormalizer.normalize("I can log in"));
    }

    @Test
    void handlesNullAndBlank() {
        assertThat(QueryNormalizer.normalize(null)).isEmpty();
        assertThat(QueryNormalizer.normalize("   ")).isEmpty();
    }
}
