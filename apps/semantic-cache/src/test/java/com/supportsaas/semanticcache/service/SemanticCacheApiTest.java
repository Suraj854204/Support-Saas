package com.supportsaas.semanticcache.service;

import java.util.Map;
import java.util.Random;

import com.supportsaas.semanticcache.model.LookupRequest;
import com.supportsaas.semanticcache.model.LookupResponse;
import com.supportsaas.semanticcache.model.StoreRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Boots the real application and exercises the HTTP contract the AI service depends on.
 * Redis is off, so this covers L1 + the semantic path end to end.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class SemanticCacheApiTest {

    private static final int DIMENSION = 8;

    @Autowired
    private TestRestTemplate http;

    @Test
    void healthReportsTheService() {
        ResponseEntity<Map> response = http.getForEntity("/health", Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("service", "semantic-cache");
    }

    @Test
    void missThenStoreThenHit() {
        float[] embedding = vector(101);
        String query = "how do I export my invoices";

        LookupResponse miss = http.postForObject("/api/v1/cache/lookup", lookup(query, embedding),
                LookupResponse.class);
        assertThat(miss.hit()).isFalse();
        assertThat(miss.leaseId()).isNotBlank();

        http.postForObject("/api/v1/cache/store",
                new StoreRequest("org_api", query, embedding, "Settings > Billing > Invoices.",
                        "gemini-2.5-flash", "v1", "v1", "7", "r", "g", "", "en", null, miss.leaseId()),
                Map.class);

        LookupResponse hit = http.postForObject("/api/v1/cache/lookup", lookup(query, embedding),
                LookupResponse.class);

        assertThat(hit.hit()).isTrue();
        assertThat(hit.matchType()).isEqualTo("EXACT");
        assertThat(hit.response()).isEqualTo("Settings > Billing > Invoices.");
    }

    @Test
    void rejectsAMalformedEmbedding() {
        ResponseEntity<Map> response = http.postForEntity("/api/v1/cache/lookup",
                new LookupRequest("org_api", "q", new float[] { 1, 2 }, "m", "v1", "v1", "7", "r", "g", "", "en", 0),
                Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void rejectsAMissingOrgId() {
        ResponseEntity<Map> response = http.postForEntity("/api/v1/cache/lookup",
                new LookupRequest("", "q", vector(1), "m", "v1", "v1", "7", "r", "g", "", "en", 0),
                Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void statsAreExposed() {
        ResponseEntity<Map> response = http.getForEntity("/api/v1/cache/stats", Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsKeys("requests", "hits", "misses", "llmCallsAvoided");
    }

    @Test
    void statsNeverExposeCachedContent() {
        float[] embedding = vector(202);
        http.postForObject("/api/v1/cache/store",
                new StoreRequest("org_api", "secret question", embedding, "secret customer answer",
                        "gemini-2.5-flash", "v1", "v1", "7", "r", "g", "", "en", null, null),
                Map.class);

        String body = http.getForObject("/api/v1/cache/stats", String.class);

        assertThat(body).doesNotContain("secret customer answer");
        assertThat(body).doesNotContain("secret question");
    }

    @Test
    void invalidateBumpsTheKbVersionAndDropsTheOrgsEntries() {
        float[] embedding = vector(303);
        String query = "what are your business hours";

        http.postForObject("/api/v1/cache/store",
                new StoreRequest("org_inv", query, embedding, "9 to 5.",
                        "gemini-2.5-flash", "v1", "v1", null, "r", "g", "", "en", null, null),
                Map.class);

        assertThat(http.postForObject("/api/v1/cache/lookup",
                new LookupRequest("org_inv", query, embedding, "gemini-2.5-flash", "v1", "v1",
                        null, "r", "g", "", "en", 0), LookupResponse.class).hit()).isTrue();

        http.postForObject("/api/v1/cache/invalidate",
                Map.of("orgId", "org_inv", "bumpKbVersion", true, "reason", "kb_change"), Map.class);

        assertThat(http.postForObject("/api/v1/cache/lookup",
                new LookupRequest("org_inv", query, embedding, "gemini-2.5-flash", "v1", "v1",
                        null, "r", "g", "", "en", 0), LookupResponse.class).hit()).isFalse();
    }

    private LookupRequest lookup(String query, float[] embedding) {
        return new LookupRequest("org_api", query, embedding, "gemini-2.5-flash", "v1", "v1",
                "7", "r", "g", "", "en", 0);
    }

    private static float[] vector(int seed) {
        Random random = new Random(seed);
        float[] result = new float[DIMENSION];
        for (int i = 0; i < DIMENSION; i++) {
            result[i] = (float) random.nextGaussian();
        }
        return result;
    }
}
