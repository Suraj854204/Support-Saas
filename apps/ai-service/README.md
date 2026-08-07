# @support-saas/ai-service

FastAPI service for RAG knowledge base retrieval, AI-suggested replies, and
ticket summarization/sentiment. Internal only — called by the Node API, never
exposed to the browser.

## Architecture

LlamaIndex handles chunking (`SentenceSplitter`), embedding, and retrieval
against Qdrant. Every point gets an `org_id` in its payload and every query
filters on it, so tenants share one Qdrant collection without being able to
read each other's articles.

LangChain handles the actual prompting — a structured-output chain for
summarize/sentiment, and a RAG prompt for suggested replies that grounds the
answer in whatever LlamaIndex retrieved.

LLM + embeddings are Gemini via `langchain-google-genai`. `app/llm.py` is the
only place that builds the chat/embedding clients. Grab a key at
https://aistudio.google.com/apikey and put it in `.env` as `GOOGLE_API_KEY`.
Default models: `gemini-2.5-flash` for chat, `models/text-embedding-004`
(768-dim, matches `QDRANT_VECTOR_SIZE`) for embeddings.

Kafka topics for AI events already exist in `@support-saas/shared-types` for
future analytics/audit consumers, but suggested-reply needs a synchronous
answer while an agent has a ticket open, so that path goes over plain HTTP
from Node instead.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + which providers are configured |
| POST | `/ai/index/article` | Chunk + embed a KB article into Qdrant |
| DELETE | `/ai/index/article/{id}` | Remove all chunks for an article |
| POST | `/ai/summarize` | Ticket transcript → summary + sentiment |
| POST | `/ai/suggest-reply` | RAG retrieve + draft a grounded reply |

Schemas live in `app/schemas.py` — run the service and hit `/docs` for Swagger.

## Setup

```bash
cd apps/ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set GOOGLE_API_KEY
uvicorn app.main:app --reload --port 8000
```

## Testing

```bash
pip install -r requirements.txt   # includes pytest
python -m pytest -v               # 15 tests, ~2s
```

`tests/conftest.py` has a `fake_vector_store` fixture (in-memory Qdrant + a
deterministic hash embedder) and a `client` fixture (FastAPI `TestClient`).
Whole suite runs offline — no Gemini key, no Qdrant, no network. Same setup
CI uses (`.github/workflows/ci.yml`).

## Status / known gaps

Chunking, indexing, org isolation (including a cross-tenant leak test),
delete-then-reindex, and the suggest-reply retrieve→synthesize pipeline
(mocked chat model) are all covered and passing. Also caught and fixed a
real crash on deleting an article that was never indexed — regression test
is `test_delete_article_before_any_index_does_not_crash`.

App boots for real and `/health` returns 200; routes that need Gemini/Qdrant
return a clean 502 instead of crashing when those aren't reachable.

**Not yet tested against real infra** — build sandbox only had network access
to package registries, so no live Gemini calls or a real Qdrant instance.
Wire up actual credentials and re-run before this touches production.

## Node API integration (Phase 5 wiring)

- `POST /api/knowledge` (Node) → indexes into this service on create/update
- `POST /api/tickets/:id/ai-suggest` (Node) → proxies to `/ai/suggest-reply`
- Ticket creation with an initial customer message best-effort calls
  `/ai/summarize` to populate `ticket.aiSummary` / `ticket.aiSentiment`