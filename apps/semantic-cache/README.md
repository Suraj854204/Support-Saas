# SemantiCache

A semantic response cache that sits in front of the AI service's RAG + LLM path.

Support inboxes get the same question phrased a dozen ways. "How do I reset my password?",
"I forgot my password, how do I change it?" and "what's the procedure to reset my account
password?" all resolve to the same knowledge-base articles and, usually, the same answer — but
each one currently pays for a Qdrant retrieval and a Gemini generation.

SemantiCache reuses a previous answer when the new request is close enough *and* was produced
under the same conditions (same org, model, prompt, KB version, retrieval config). It is an
optimization layer, never a dependency: if this service is down, slow, or returns nonsense, the
AI service runs the normal RAG pipeline and answers exactly as it did before.

---

## Where it sits

```
Customer
   │
   ▼
Next.js frontend (apps/web)
   │
   ▼
Express gateway (apps/api)          ── admin only ──┐
   │                                                │
   ▼                                                │
FastAPI AI service (apps/ai-service)                │
   │  suggest_reply()                               │
   │                                                │
   ├─► embed query (existing Gemini embeddings)     │
   │                                                │
   ▼                                                ▼
Java SemantiCache (this service) ◄──────────  /api/semantic-cache/*
   ├── L1: custom LRU (HashMap + doubly linked list)
   ├── Bloom filter  ─ skip the L2 round trip for unseen identities
   ├── LSH           ─ random hyperplanes → candidate set
   ├── Cosine        ─ exact score on candidates
   ├── Compatibility ─ org / model / prompt / kbVersion / retrieval / TTL
   ├── Coalescer     ─ ConcurrentHashMap + CompletableFuture
   ├── Scheduler     ─ PriorityQueue backpressure
   └── L2: Redis (the cluster the SaaS already runs)
   │
   ├── HIT  ──► cached reply returned, no retrieval, no LLM
   │
   └── MISS ──► existing RAG pipeline
                   │
                   ▼
                Qdrant retrieval (org-filtered)
                   │
                   ▼
                Gemini generation
                   │
                   ▼
                store in SemantiCache ──► return
```

The integration point is `apps/ai-service/app/services/suggest_reply.py::suggest_reply()`. The
gateway's hot path is untouched — it still calls `POST /ai/suggest-reply` and gets the same
response shape.

The AI service sends the embedding it already computed, so a cache miss does **not** pay for a
second embedding call. This service never talks to an embedding provider or to Qdrant.

---

## Data structures

Full write-up with complexities and trade-offs in [DSA.md](./DSA.md). Short version:

| Component | Structure | Cost |
|---|---|---|
| L1 cache | `HashMap` + doubly linked list | get/put/remove/evict O(1) |
| Membership gate | bit array + k hashes (Kirsch–Mitzenmacher) | O(k) |
| Candidate search | random-hyperplane LSH, `L` tables of `K` planes | O(L·K) to sign, O(candidates) to union |
| Final match | exact cosine | O(d) per candidate |
| Thundering herd | `ConcurrentHashMap` + `CompletableFuture` | O(1) per waiter |
| Backpressure | `PriorityQueue` with aging | O(log n) per admit |

Semantic lookup is **not** O(1) and LSH does **not** guarantee the true nearest neighbour. LSH
narrows the search space; cosine then scores the survivors exactly; the threshold decides.

---

## Correctness before hit rate

A cache miss costs money. A false positive sends a customer the wrong answer. The pipeline is
built around that asymmetry:

- **Compatibility is checked before similarity.** An entry from a different org, model,
  prompt version, KB version or retrieval config is discarded without ever being scored, so a
  high cosine score can't rescue a stale entry.
- **Tenant isolation is structural, not a filter.** `orgId` is hashed into the cache key *and*
  the LSH index is partitioned per org, so entries from another tenant are never candidates in
  the first place. `CompatibilityChecker` re-checks `orgId` anyway as defense in depth.
- **KB edits invalidate immediately.** Indexing or deleting a knowledge article bumps that org's
  `kbVersion`, which makes every prior answer for the org incompatible in one operation.
- **Fallback replies are never cached.** When the LLM fails or no relevant article was found,
  the AI service releases its lease instead of storing — otherwise a transient failure would be
  frozen for the whole TTL.
- **Threshold trade-off.** Higher `SEMANTIC_SIMILARITY_THRESHOLD` → fewer wrong reuses, lower hit
  rate. Lower → more hits, more risk. The default is deliberately conservative; tune it against
  your own traffic, not against a hit-rate target.
- **Optional judge.** Matches in the borderline band are reused only if an LLM judge says the two
  questions want the same answer. Off by default, because a judge on every request just replaces
  one LLM call with another.

---

## API

All endpoints require `X-Internal-Token` when `SEMANTIC_CACHE_SERVICE_TOKEN` is set.
`/actuator/health` and `/actuator/prometheus` are exempt so probes and scrapers work.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/cache/lookup` | Hit / miss / coalesced-wait / judge-candidate. Returns a lease id on a miss. |
| `POST` | `/api/v1/cache/store` | Store a generated answer against a lease and release waiters. |
| `POST` | `/api/v1/cache/release` | Release a lease without storing (fallback reply, LLM error). |
| `POST` | `/api/v1/cache/invalidate` | Bump an org's KB version and drop its entries. |
| `POST` | `/api/v1/cache/clear` | Drop everything. |
| `GET`  | `/api/v1/cache/stats` | Counters, rates, latency percentiles. No cached content. |
| `GET`  | `/health` | Same shape as the other services. Redis down reports `degraded`, not `down`. |
| `GET`  | `/actuator/prometheus` | Micrometer metrics. |

`lookup` returns a `CompletableFuture`, so a coalesced waiter parks server-side without holding
a servlet thread.

Through the gateway (JWT + `manage_security` permission, always scoped to the caller's own org):

```
GET  /api/semantic-cache/stats
POST /api/semantic-cache/invalidate
```

---

## Configuration

Everything is an environment variable; see the SemantiCache block in the repo's `.env.example`
for the full list with comments. The ones that matter most:

| Variable | Default | Notes |
|---|---|---|
| `SEMANTIC_CACHE_ENABLED` | `true` | `false` makes every lookup a miss. |
| `CACHE_EMBEDDING_DIMENSION` | `3072` | **Must match `QDRANT_VECTOR_SIZE`.** |
| `SEMANTIC_SIMILARITY_THRESHOLD` | `0.92` | Precision/hit-rate dial. |
| `SEMANTIC_JUDGE_ENABLED` | `false` | Borderline LLM judge, runs in the AI service. |
| `CACHE_L1_CAPACITY` | `10000` | ~12 KB/entry at dim 3072, mostly the embedding. |
| `CACHE_TTL_SECONDS` | `3600` | |
| `LSH_TABLES` / `LSH_HYPERPLANES` | `8` / `12` | More tables = better recall, more memory. |
| `BLOOM_GATES_L2` | `true` | Set `false` in multi-instance setups (see limitations). |
| `LLM_COST_PER_CALL` | `0` | Cost reporting stays at zero until you supply real numbers. |

---

## Running

```bash
# unit + integration + concurrency tests
mvn test

# benchmark (skipped by default)
mvn test -Dtest=CacheBenchmark -Dbenchmark=true
```

With the rest of the stack:

```bash
docker compose -f infra/docker/docker-compose.yml --profile apps up semantic-cache
```

---

## Limitations

- **L1, the LSH index and coalescing are per-JVM.** Running N replicas means N independent
  semantic indexes. Redis (L2) is shared but stores entries by exact identity key, so it serves
  exact hits across instances, not semantic ones. Invalidation is shared through Redis, so a KB
  bump is cluster-wide.
- **The Bloom filter only knows what this instance wrote.** With `BLOOM_GATES_L2=true` a negative
  can skip an L2 entry a peer instance stored. That costs a hit, never correctness. Set it to
  `false` if cross-instance exact hits matter more than saving the round trip.
- **LSH is approximate.** A genuinely similar entry can land in no shared bucket and be missed.
  That is a miss, not a wrong answer.
- **The Bloom filter has no delete.** Evicted and invalidated keys stay set, so its false-positive
  rate drifts up over a long-lived process. It is only ever a gate.
- **Cost figures are whatever you configure.** Nothing is priced in by default.
- The spec sketched an `LshBucket.java`; a `ConcurrentHashMap<Long, Set<String>>` per table does
  the same job in less code, so the class was deliberately left out.
