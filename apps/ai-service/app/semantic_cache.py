"""
Client for the Java SemantiCache service.

Every call here is best-effort. If the cache is disabled, unreachable, slow or returns something
unexpected, these functions return None and the caller falls through to the normal RAG + LLM
path. Caching is an optimisation; it is never allowed to be the reason a customer gets no reply.

The Java service holds no embedding model of its own — we send the vector we already computed
for retrieval, so there is exactly one embedding model in the platform.
"""

from __future__ import annotations

import hashlib
import json
import logging
from functools import lru_cache
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

LOOKUP_PATH = "/api/v1/cache/lookup"
STORE_PATH = "/api/v1/cache/store"
RELEASE_PATH = "/api/v1/cache/release"
INVALIDATE_PATH = "/api/v1/cache/invalidate"


@lru_cache
def _client() -> httpx.Client:
    settings = get_settings()

    # A short connect timeout keeps a dead service from adding latency, while the read timeout
    # has to be generous: a coalesced request is held open until the owner's answer lands.
    timeout = httpx.Timeout(
        connect=settings.SEMANTIC_CACHE_CONNECT_TIMEOUT_SECONDS,
        read=settings.SEMANTIC_CACHE_READ_TIMEOUT_SECONDS,
        write=5.0,
        pool=5.0,
    )

    headers = {"Content-Type": "application/json"}
    if settings.SEMANTIC_CACHE_SERVICE_TOKEN:
        headers["X-Internal-Token"] = settings.SEMANTIC_CACHE_SERVICE_TOKEN

    return httpx.Client(
        base_url=settings.SEMANTIC_CACHE_URL,
        timeout=timeout,
        headers=headers,
    )


def is_enabled() -> bool:
    return get_settings().SEMANTIC_CACHE_ENABLED


# ============================================================================
# CACHE IDENTITY CONTEXT
#
# Anything that can legitimately change the answer to the same question belongs here. If one of
# these changes, previously cached answers stop matching and are regenerated.
# ============================================================================


def _digest(*parts: Any) -> str:
    joined = "\u0000".join(str(part) for part in parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]


def retrieval_config_hash() -> str:
    """Retrieval settings, plus the embedding model — a different model means a different
    vector space, and similarity scores across spaces are meaningless."""
    settings = get_settings()
    return _digest(
        settings.GEMINI_EMBEDDING_MODEL,
        settings.QDRANT_COLLECTION,
        settings.QDRANT_VECTOR_SIZE,
        settings.RETRIEVAL_TOP_K,
        settings.MIN_CONFIDENCE_SIMILARITY,
    )


def generation_config_hash(*parts: Any) -> str:
    return _digest(*parts)


def prompt_version(prompt_text: str) -> str:
    """Derived from the prompt itself, so editing the system prompt invalidates answers written
    under the old one without anyone remembering to bump a constant."""
    return _digest(prompt_text)


# ============================================================================
# OPERATIONS
# ============================================================================


def lookup(
    *,
    org_id: str,
    query: str,
    embedding: list[float],
    prompt_version_hash: str,
    retrieval_hash: str,
    generation_hash: str,
    language: str = "en",
    priority: int = 0,
) -> dict[str, Any] | None:
    """Returns the lookup result, or None when the cache could not answer at all."""
    if not is_enabled():
        return None

    settings = get_settings()
    payload = {
        "orgId": org_id,
        "query": query,
        "embedding": embedding,
        "model": settings.GEMINI_CHAT_MODEL,
        "modelVersion": settings.SEMANTIC_CACHE_MODEL_VERSION,
        "promptVersion": prompt_version_hash,
        "retrievalConfigHash": retrieval_hash,
        "generationConfigHash": generation_hash,
        "toolContextHash": "",
        "language": language,
        "priority": priority,
    }

    try:
        response = _client().post(LOOKUP_PATH, json=payload)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        logger.warning("SemantiCache lookup unavailable, falling back to RAG: %s", exc)
        return None


def store(
    *,
    org_id: str,
    query: str,
    embedding: list[float],
    response_payload: str,
    prompt_version_hash: str,
    retrieval_hash: str,
    generation_hash: str,
    language: str = "en",
    lease_id: str | None = None,
) -> None:
    if not is_enabled():
        return

    settings = get_settings()
    payload = {
        "orgId": org_id,
        "query": query,
        "embedding": embedding,
        "response": response_payload,
        "model": settings.GEMINI_CHAT_MODEL,
        "modelVersion": settings.SEMANTIC_CACHE_MODEL_VERSION,
        "promptVersion": prompt_version_hash,
        "retrievalConfigHash": retrieval_hash,
        "generationConfigHash": generation_hash,
        "toolContextHash": "",
        "language": language,
        "leaseId": lease_id,
    }

    try:
        _client().post(STORE_PATH, json=payload).raise_for_status()
    except Exception as exc:
        logger.warning("SemantiCache store failed, answer served but not cached: %s", exc)


def release(lease_id: str, reason: str) -> None:
    """Frees requests waiting on us when we could not produce an answer worth caching."""
    if not is_enabled() or not lease_id:
        return

    try:
        _client().post(RELEASE_PATH, params={"leaseId": lease_id, "reason": reason}).raise_for_status()
    except Exception as exc:
        logger.warning("SemantiCache release failed: %s", exc)


def invalidate_org(org_id: str, reason: str) -> None:
    """Called when an org's knowledge base changes. Bumping the KB version makes every answer
    generated against the previous version unreachable in one operation."""
    if not is_enabled():
        return

    try:
        _client().post(
            INVALIDATE_PATH,
            json={"orgId": org_id, "bumpKbVersion": True, "reason": reason},
        ).raise_for_status()
        logger.info("SemantiCache invalidated for org_id=%s (%s)", org_id, reason)
    except Exception as exc:
        logger.warning("SemantiCache invalidation failed for org_id=%s: %s", org_id, exc)


def health() -> str:
    if not is_enabled():
        return "disabled"

    try:
        response = _client().get("/health", timeout=2.0)
        response.raise_for_status()
        return str(response.json().get("status", "unknown"))
    except Exception:
        return "unavailable"


def encode_payload(suggested_reply: str, confidence: float, source_articles: list[Any]) -> str:
    """The Java service stores the response as an opaque string, so the full reply payload
    survives a cache hit rather than just the text."""
    return json.dumps(
        {
            "suggested_reply": suggested_reply,
            "confidence": confidence,
            "source_articles": [
                article.model_dump() if hasattr(article, "model_dump") else article
                for article in source_articles
            ],
        }
    )


def decode_payload(payload: str) -> dict[str, Any] | None:
    try:
        decoded = json.loads(payload)
    except (TypeError, ValueError):
        logger.warning("Cached payload was not valid JSON, treating as a miss")
        return None

    if not isinstance(decoded, dict) or "suggested_reply" not in decoded:
        return None
    return decoded
