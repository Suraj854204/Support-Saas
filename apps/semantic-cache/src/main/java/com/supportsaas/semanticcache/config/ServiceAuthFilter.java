package com.supportsaas.semanticcache.config;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Shared-secret check for service-to-service calls.
 *
 * This service is internal — only the AI service and the gateway should reach it, and it holds
 * cached customer answers, so it is not something to leave open on the network. Health and
 * metrics stay unauthenticated for probes and the Prometheus scraper.
 */
@Component
public class ServiceAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(ServiceAuthFilter.class);
    private static final String HEADER = "X-Internal-Token";

    private final String expectedToken;

    public ServiceAuthFilter(CacheProperties properties) {
        this.expectedToken = properties.getServiceToken();
        if (expectedToken == null || expectedToken.isBlank()) {
            log.warn("SEMANTIC_CACHE_SERVICE_TOKEN is not set — service-to-service auth is disabled. "
                    + "Set it in every environment except local development.");
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/actuator/health") || path.startsWith("/actuator/prometheus");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        if (expectedToken == null || expectedToken.isBlank()) {
            chain.doFilter(request, response);
            return;
        }

        String provided = request.getHeader(HEADER);
        if (provided == null || !constantTimeEquals(provided, expectedToken)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"unauthorized\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    private static boolean constantTimeEquals(String a, String b) {
        return java.security.MessageDigest.isEqual(
                a.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                b.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
