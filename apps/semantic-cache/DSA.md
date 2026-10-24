# Data structures in SemantiCache

Each section covers what the structure is solving, why it beat the alternatives here, and where
it falls down. Complexities are for the operations the request path actually performs.

---

## LRU cache — `cache/LruCache.java`

**Problem.** Keep the hottest answers in memory under a fixed budget, and look one up in
constant time on every request.

**Structure.** `HashMap<K, CacheNode>` plus a doubly linked list of the same nodes. The map
resolves a key to its node; the node's `prev`/`next` pointers place it in recency order.

**Algorithm.** `get` resolves the node and moves it to the head. `put` inserts at the head and,
if the map is over capacity, unlinks the tail and removes its key. Because the map holds the node
itself, every one of those steps is a pointer rewrite — there is never a scan for "the oldest
entry".

| operation | time | note |
|---|---|---|
| `get` | O(1) | hash lookup + 6 pointer writes |
| `put` | O(1) | amortised, including eviction |
| `remove` | O(1) | node comes from the map |
| eviction | O(1) | tail sentinel |

**Space.** O(capacity): one map entry and one node per cached answer, plus the answer and its
embedding. At `dim=3072` the embedding dominates — roughly 12 KB per entry.

**Why not `LinkedHashMap`.** It implements the same policy, but the eviction hook we need to keep
the LSH index in sync is awkward through `removeEldestEntry`, and the recency mechanics are the
part worth having in the open here.

**Trade-off.** One `ReentrantLock` covers the map and the list because a recency update touches
both and they must not drift apart. Critical sections are a few pointer writes long, so this
serialises much less than it appears to, but it is a single lock and it would be the first thing
to stripe if profiling ever pointed here.

---

## Bloom filter — `bloom/BloomFilter.java`

**Problem.** Avoid a Redis round trip for cache identities this instance has never stored.

**Structure.** A `long[]` used as a bit array, with `k` bit positions per value.

**Algorithm.** Size the array from the configured expected insertions and target false-positive
rate using the standard formulas: `m = -n·ln(p)/(ln2)²`, `k = (m/n)·ln2`. Two base hashes are
derived from one pass over the bytes and combined as `h1 + i·h2`
(Kirsch–Mitzenmacher), which gives `k` well-spread positions without running `k` separate hash
functions.

| operation | time |
|---|---|
| `add` | O(k) |
| `mightContain` | O(k) |

**Space.** O(m) bits — about 1.2 MB for 100k insertions at p=0.01.

**Trade-offs.** It has false positives, by construction; at the configured rate roughly one
lookup in a hundred does the Redis call it could have skipped, which costs nothing but the call.
It has no false negatives, which is the property that makes the shortcut safe. It cannot delete —
clearing one entry's bits would clear bits shared with others — so evicted entries stay "maybe
present" until the filter is rebuilt.

**Scope caveat.** The filter only knows what *this* instance stored. With several instances
running, a negative answer can skip an entry a peer wrote to Redis. That is a lost hit, never a
wrong answer. `BLOOM_GATES_L2=false` turns the shortcut off if cross-instance exact hits matter
more than saving the call.

---

## Random hyperplane LSH — `lsh/RandomHyperplaneLsh.java`, `lsh/LshIndex.java`

**Problem.** Find the handful of cached questions worth comparing against, without computing
cosine similarity over every entry in the cache.

**Structure.** `L` tables, each holding `h` random hyperplanes drawn from a Gaussian. A vector's
signature in a table is the `h` bits recording which side of each plane it falls on. Buckets are
`Map<Long signature, Set<cacheKey>>`, one map per table, partitioned by `orgId`.

**Algorithm.**

```
embedding -> sign(plane · v) for each plane -> h-bit signature -> bucket per table
candidates = union of the buckets the query lands in, across all tables
```

Two vectors agree on one bit with probability `1 - θ/π`, so a signature match across `h` bits
happens with probability `(1 - θ/π)^h`, and `L` tables raise recall to
`1 - (1 - (1 - θ/π)^h)^L`. Small angles collide far more often than large ones; that is the whole
mechanism.

| operation | time |
|---|---|
| signature | O(L·h·d) |
| insert | O(L·h·d) |
| candidate lookup | O(L·h·d + candidates) |

**Space.** `L·h·d` floats for the planes (1.2 MB at 8×12×3072), plus one bucket entry per table
per cached entry.

**What this is not.** It is not nearest-neighbour search. It can miss a genuine neighbour — a
cache miss, so the normal pipeline runs — and it routinely returns unrelated entries, which the
exact cosine check discards. Nothing here is O(1), and the candidate set is capped
(`LSH_MAX_CANDIDATES`) so one crowded bucket cannot turn a lookup into a scan.

**Tuning.** More tables: higher recall, more memory, more candidates to score. More hyperplanes
per table: narrower buckets, fewer candidates, lower recall.

**Scope caveat.** The index is per JVM. Redis (L2) is shared, but only serves exact-identity
hits, so semantic hit rate warms up per instance.

---

## Cosine similarity — `similarity/CosineSimilarity.java`

**Problem.** Decide how close two embeddings actually are, once LSH has narrowed the field.

**Algorithm.** `dot(a,b) / (‖a‖·‖b‖)`, in one pass accumulating all three sums. Norms are
recomputed rather than assumed: most providers return unit vectors, but an un-normalised one
would silently inflate every score and push false positives past the threshold.

| operation | time | space |
|---|---|---|
| similarity | O(d) | O(1) |

A lookup that scores `c` candidates costs O(c·d) — with the defaults, 64 × 3072 multiply-adds,
which is the most expensive part of a cache lookup and the reason the candidate cap exists.

---

## Request coalescer — `concurrency/RequestCoalescer.java`

**Problem.** Fifty customers asking the same thing in the same second should cost one LLM call,
not fifty.

**Structure.** `ConcurrentHashMap<cacheIdentity, CompletableFuture<String>>`, plus a second map
from lease id to the same record so `store` can find the future it needs to complete.

**Algorithm.** `putIfAbsent` decides the owner atomically. The owner runs RAG + LLM and completes
the future; everyone else returns that future and is served from it. Keys are exact cache
identities, so two different questions — or two tenants — can never be merged.

| operation | time |
|---|---|
| `begin` | O(1) |
| `complete` / `fail` | O(1) |

**Failure handling.** Every future carries `orTimeout`. If the owner hangs or dies, waiters fail
fast and run the pipeline themselves. A `whenComplete` hook removes the map entries on every
outcome — success, failure, timeout — so nothing is left in flight.

**Scope caveat.** Per JVM. Across `n` instances the worst case is `n` executions, not one per
request.

---

## Priority queue — `scheduler/LlmRequestScheduler.java`

**Problem.** A burst of cache misses fans straight out to the LLM provider and collects rate
limits. Cap the concurrency and serve the important work first.

**Structure.** `java.util.PriorityQueue<Waiter>` under a `ReentrantLock`, ordered by priority
then arrival time. Each waiter holds a `CompletableFuture<Boolean>` that completes when it is
admitted.

| operation | time |
|---|---|
| `acquire` | O(log n) |
| `release` / dispatch | O(log n) |

**Starvation.** `PriorityQueue` has no notion of ageing, and a comparator that reads the clock
would break the heap invariant. So a sweep every second pulls waiters that have been queued past
`SCHEDULER_AGING_AFTER_MS`, bumps their priority and re-inserts them — which re-heapifies them
into a better position. Anything queued long enough eventually outranks new arrivals.

**Deliberately advisory.** If the queue is full or a waiter times out, `acquire` reports false
and the caller proceeds anyway. The cache must never be the reason a customer gets no answer, so
what this buys under load is smoothing and ordering, not a hard ceiling.
