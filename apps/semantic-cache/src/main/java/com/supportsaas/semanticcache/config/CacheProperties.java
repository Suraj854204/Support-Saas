package com.supportsaas.semanticcache.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Everything tunable. Bound from application.yml, which reads the same env vars as the rest of the platform. */
@ConfigurationProperties(prefix = "semanticcache")
public class CacheProperties {

    private boolean enabled = true;

    private int l1Capacity = 10_000;
    private long ttlSeconds = 3600;
    private int maxResponseBytes = 32_768;
    private int embeddingDimension = 3072;

    /**
     * Above this cosine similarity a candidate is reusable once compatibility passes. Raising it
     * cuts false positives and the hit rate together; a false positive here means a customer gets
     * an answer to a question they did not ask, which is worse than a miss.
     */
    private double similarityThreshold = 0.92;

    /** Candidates between this and the threshold are returned for an optional judge instead of reused. */
    private double judgeThreshold = 0.88;
    private boolean judgeEnabled = false;

    private int lshTables = 8;
    private int lshHyperplanes = 12;
    private long lshSeed = 42;
    private int maxCandidates = 64;

    private int bloomExpectedInsertions = 100_000;
    private double bloomFalsePositiveRate = 0.01;

    /**
     * Whether a negative Bloom answer is allowed to skip the L2 round trip. The filter only knows
     * what this instance stored, so with several instances running this can skip an entry a peer
     * wrote. Turn it off when cross-instance exact hits matter more than saving a Redis call.
     */
    private boolean bloomGatesL2 = true;

    private long coalesceTimeoutMs = 45_000;
    private int schedulerMaxConcurrent = 16;
    private int schedulerMaxQueueSize = 256;
    private long schedulerAcquireTimeoutMs = 5_000;
    private long schedulerAgingAfterMs = 2_000;

    private boolean redisEnabled = true;
    private String redisKeyPrefix = "semanticcache:v1";
    private long redisTimeoutMs = 250;

    /** Cost accounting stays at zero until someone fills in a real price for their provider. */
    private double costPerLlmCall = 0.0;
    private int estimatedTokensPerCall = 0;

    /** Shared secret for service-to-service calls. Blank disables the check (local dev only). */
    private String serviceToken = "";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public int getL1Capacity() {
        return l1Capacity;
    }

    public void setL1Capacity(int l1Capacity) {
        this.l1Capacity = l1Capacity;
    }

    public long getTtlSeconds() {
        return ttlSeconds;
    }

    public void setTtlSeconds(long ttlSeconds) {
        this.ttlSeconds = ttlSeconds;
    }

    public int getMaxResponseBytes() {
        return maxResponseBytes;
    }

    public void setMaxResponseBytes(int maxResponseBytes) {
        this.maxResponseBytes = maxResponseBytes;
    }

    public int getEmbeddingDimension() {
        return embeddingDimension;
    }

    public void setEmbeddingDimension(int embeddingDimension) {
        this.embeddingDimension = embeddingDimension;
    }

    public double getSimilarityThreshold() {
        return similarityThreshold;
    }

    public void setSimilarityThreshold(double similarityThreshold) {
        this.similarityThreshold = similarityThreshold;
    }

    public double getJudgeThreshold() {
        return judgeThreshold;
    }

    public void setJudgeThreshold(double judgeThreshold) {
        this.judgeThreshold = judgeThreshold;
    }

    public boolean isJudgeEnabled() {
        return judgeEnabled;
    }

    public void setJudgeEnabled(boolean judgeEnabled) {
        this.judgeEnabled = judgeEnabled;
    }

    public int getLshTables() {
        return lshTables;
    }

    public void setLshTables(int lshTables) {
        this.lshTables = lshTables;
    }

    public int getLshHyperplanes() {
        return lshHyperplanes;
    }

    public void setLshHyperplanes(int lshHyperplanes) {
        this.lshHyperplanes = lshHyperplanes;
    }

    public long getLshSeed() {
        return lshSeed;
    }

    public void setLshSeed(long lshSeed) {
        this.lshSeed = lshSeed;
    }

    public int getMaxCandidates() {
        return maxCandidates;
    }

    public void setMaxCandidates(int maxCandidates) {
        this.maxCandidates = maxCandidates;
    }

    public int getBloomExpectedInsertions() {
        return bloomExpectedInsertions;
    }

    public void setBloomExpectedInsertions(int bloomExpectedInsertions) {
        this.bloomExpectedInsertions = bloomExpectedInsertions;
    }

    public double getBloomFalsePositiveRate() {
        return bloomFalsePositiveRate;
    }

    public void setBloomFalsePositiveRate(double bloomFalsePositiveRate) {
        this.bloomFalsePositiveRate = bloomFalsePositiveRate;
    }

    public boolean isBloomGatesL2() {
        return bloomGatesL2;
    }

    public void setBloomGatesL2(boolean bloomGatesL2) {
        this.bloomGatesL2 = bloomGatesL2;
    }

    public long getCoalesceTimeoutMs() {
        return coalesceTimeoutMs;
    }

    public void setCoalesceTimeoutMs(long coalesceTimeoutMs) {
        this.coalesceTimeoutMs = coalesceTimeoutMs;
    }

    public int getSchedulerMaxConcurrent() {
        return schedulerMaxConcurrent;
    }

    public void setSchedulerMaxConcurrent(int schedulerMaxConcurrent) {
        this.schedulerMaxConcurrent = schedulerMaxConcurrent;
    }

    public int getSchedulerMaxQueueSize() {
        return schedulerMaxQueueSize;
    }

    public void setSchedulerMaxQueueSize(int schedulerMaxQueueSize) {
        this.schedulerMaxQueueSize = schedulerMaxQueueSize;
    }

    public long getSchedulerAcquireTimeoutMs() {
        return schedulerAcquireTimeoutMs;
    }

    public void setSchedulerAcquireTimeoutMs(long schedulerAcquireTimeoutMs) {
        this.schedulerAcquireTimeoutMs = schedulerAcquireTimeoutMs;
    }

    public long getSchedulerAgingAfterMs() {
        return schedulerAgingAfterMs;
    }

    public void setSchedulerAgingAfterMs(long schedulerAgingAfterMs) {
        this.schedulerAgingAfterMs = schedulerAgingAfterMs;
    }

    public boolean isRedisEnabled() {
        return redisEnabled;
    }

    public void setRedisEnabled(boolean redisEnabled) {
        this.redisEnabled = redisEnabled;
    }

    public String getRedisKeyPrefix() {
        return redisKeyPrefix;
    }

    public void setRedisKeyPrefix(String redisKeyPrefix) {
        this.redisKeyPrefix = redisKeyPrefix;
    }

    public long getRedisTimeoutMs() {
        return redisTimeoutMs;
    }

    public void setRedisTimeoutMs(long redisTimeoutMs) {
        this.redisTimeoutMs = redisTimeoutMs;
    }

    public double getCostPerLlmCall() {
        return costPerLlmCall;
    }

    public void setCostPerLlmCall(double costPerLlmCall) {
        this.costPerLlmCall = costPerLlmCall;
    }

    public int getEstimatedTokensPerCall() {
        return estimatedTokensPerCall;
    }

    public void setEstimatedTokensPerCall(int estimatedTokensPerCall) {
        this.estimatedTokensPerCall = estimatedTokensPerCall;
    }

    public String getServiceToken() {
        return serviceToken;
    }

    public void setServiceToken(String serviceToken) {
        this.serviceToken = serviceToken;
    }
}
