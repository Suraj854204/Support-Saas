"""
Integration of the semantic cache with the existing suggest-reply pipeline.

The Java service is stubbed here — its own behaviour is covered by its JUnit suite. What these
tests pin down is the contract on this side: a hit skips retrieval and the LLM, a miss still runs
the full pipeline and stores the result, and every cache failure mode degrades to the original
behaviour.
"""

from unittest.mock import MagicMock, patch

import pytest

import app.semantic_cache as sc
import app.services.suggest_reply as sr
from app.schemas import SuggestReplyRequest, TicketMessageInput


@pytest.fixture
def cache_on(monkeypatch):
    monkeypatch.setattr(sc, "is_enabled", lambda: True)
    monkeypatch.setattr(sr, "embed_query", lambda text: [0.1, 0.2, 0.3])
    yield


def request_for(body: str = "How do I reset my password?") -> SuggestReplyRequest:
    return SuggestReplyRequest(
        org_id="org_a",
        ticket_id="t1",
        messages=[TicketMessageInput(author_type="customer", body=body)],
    )


def cached_hit(reply: str = "Go to Settings > Security.", match_type: str = "EXACT") -> dict:
    return {
        "hit": True,
        "matchType": match_type,
        "similarity": 0.97,
        "response": sc.encode_payload(reply, 0.81, []),
        "leaseId": None,
    }


def cache_miss(lease_id: str | None = "lease-1") -> dict:
    return {"hit": False, "reason": "NO_COMPATIBLE_ENTRY", "leaseId": lease_id}


# ============================================================================
# HIT PATH
# ============================================================================


def test_cache_hit_skips_retrieval_and_the_llm(cache_on, monkeypatch):
    monkeypatch.setattr(sc, "lookup", lambda **kwargs: cached_hit())

    retrieve = MagicMock()
    monkeypatch.setattr(sr, "retrieve", retrieve)

    with patch("app.services.suggest_reply.get_chat_model") as chat_model:
        result = sr.suggest_reply(request_for())

    assert result.suggested_reply == "Go to Settings > Security."
    assert result.confidence == 0.81
    retrieve.assert_not_called()
    chat_model.assert_not_called()


def test_semantic_hit_is_served_like_an_exact_hit(cache_on, monkeypatch):
    monkeypatch.setattr(sc, "lookup", lambda **kwargs: cached_hit(match_type="SEMANTIC"))
    monkeypatch.setattr(sr, "retrieve", MagicMock())

    with patch("app.services.suggest_reply.get_chat_model") as chat_model:
        result = sr.suggest_reply(request_for("I forgot my password, how can I change it?"))

    assert result.suggested_reply == "Go to Settings > Security."
    chat_model.assert_not_called()


def test_unreadable_cached_payload_is_treated_as_a_miss(cache_on, monkeypatch, fake_vector_store):
    monkeypatch.setattr(
        sc, "lookup",
        lambda **kwargs: {"hit": True, "matchType": "EXACT", "response": "not-json", "leaseId": None},
    )
    monkeypatch.setattr(sc, "store", lambda **kwargs: None)
    monkeypatch.setattr(sc, "release", lambda *args: None)

    result = sr.suggest_reply(request_for())

    assert result.suggested_reply  # pipeline ran instead of returning garbage


# ============================================================================
# MISS PATH
# ============================================================================


def test_miss_runs_the_pipeline_and_stores_the_result(cache_on, monkeypatch, fake_vector_store):
    fake_vector_store.index_article(
        "org_a", "art_1", "Password reset",
        "To reset your password, visit Settings > Security and click Reset.", [],
    )

    monkeypatch.setattr(sc, "lookup", lambda **kwargs: cache_miss())

    stored = {}
    monkeypatch.setattr(sc, "store", lambda **kwargs: stored.update(kwargs))

    fake_llm = MagicMock()
    fake_llm.invoke.return_value = MagicMock(content="Go to Settings > Security and click Reset.")

    with patch("app.services.suggest_reply.get_chat_model", return_value=fake_llm):
        result = sr.suggest_reply(request_for())

    assert "Settings" in result.suggested_reply
    assert stored["org_id"] == "org_a"
    assert stored["lease_id"] == "lease-1"
    assert stored["embedding"] == [0.1, 0.2, 0.3]
    assert sc.decode_payload(stored["response_payload"])["suggested_reply"] == result.suggested_reply


def test_the_query_is_embedded_once_and_reused_for_retrieval(cache_on, monkeypatch, fake_vector_store):
    calls = []
    monkeypatch.setattr(sr, "embed_query", lambda text: calls.append(text) or [0.5, 0.5])
    monkeypatch.setattr(sc, "lookup", lambda **kwargs: cache_miss())
    monkeypatch.setattr(sc, "store", lambda **kwargs: None)
    monkeypatch.setattr(sc, "release", lambda *args: None)

    retrieve = MagicMock(return_value=[])
    monkeypatch.setattr(sr, "retrieve", retrieve)

    sr.suggest_reply(request_for())

    assert len(calls) == 1
    assert retrieve.call_args.kwargs["embedding"] == [0.5, 0.5]


def test_the_fallback_reply_is_never_cached(cache_on, monkeypatch, fake_vector_store):
    monkeypatch.setattr(sc, "lookup", lambda **kwargs: cache_miss())

    store = MagicMock()
    release = MagicMock()
    monkeypatch.setattr(sc, "store", store)
    monkeypatch.setattr(sc, "release", release)

    result = sr.suggest_reply(request_for("What is the weather today?"))

    assert result.suggested_reply == sr.FALLBACK_REPLY
    store.assert_not_called()
    release.assert_called_once()
    assert release.call_args.args[0] == "lease-1"


# ============================================================================
# DEGRADATION
# ============================================================================


def test_cache_service_being_down_does_not_break_suggestions(cache_on, monkeypatch, fake_vector_store):
    fake_vector_store.index_article("org_a", "art_1", "Password reset", "Visit Settings > Security.", [])

    monkeypatch.setattr(sc, "lookup", lambda **kwargs: None)
    monkeypatch.setattr(sc, "store", lambda **kwargs: None)

    fake_llm = MagicMock()
    fake_llm.invoke.return_value = MagicMock(content="Visit Settings > Security.")

    with patch("app.services.suggest_reply.get_chat_model", return_value=fake_llm):
        result = sr.suggest_reply(request_for())

    assert "Settings" in result.suggested_reply


def test_a_failing_embedding_call_skips_the_cache_not_the_answer(cache_on, monkeypatch, fake_vector_store):
    fake_vector_store.index_article("org_a", "art_1", "Password reset", "Visit Settings > Security.", [])

    def boom(text):
        raise RuntimeError("embedding provider unavailable")

    monkeypatch.setattr(sr, "embed_query", boom)

    lookup = MagicMock()
    store = MagicMock()
    monkeypatch.setattr(sc, "lookup", lookup)
    monkeypatch.setattr(sc, "store", store)

    fake_llm = MagicMock()
    fake_llm.invoke.return_value = MagicMock(content="Visit Settings > Security.")

    with patch("app.services.suggest_reply.get_chat_model", return_value=fake_llm):
        result = sr.suggest_reply(request_for())

    assert "Settings" in result.suggested_reply
    lookup.assert_not_called()
    store.assert_not_called()


def test_disabled_cache_leaves_the_original_flow_untouched(monkeypatch, fake_vector_store):
    monkeypatch.setattr(sc, "is_enabled", lambda: False)

    embed = MagicMock()
    monkeypatch.setattr(sr, "embed_query", embed)

    lookup = MagicMock()
    monkeypatch.setattr(sc, "lookup", lookup)

    sr.suggest_reply(request_for("What is the weather today?"))

    embed.assert_not_called()
    lookup.assert_not_called()


# ============================================================================
# BORDERLINE JUDGE
# ============================================================================


def judge_candidate() -> dict:
    return {
        "hit": False,
        "reason": "JUDGE_REQUIRED",
        "leaseId": "lease-9",
        "judgeCandidate": {
            "similarity": 0.90,
            "query": "How do I reset my password?",
            "response": sc.encode_payload("Go to Settings > Security.", 0.8, []),
        },
    }


def test_borderline_candidates_are_ignored_when_the_judge_is_off(cache_on, monkeypatch, fake_vector_store):
    monkeypatch.setattr(sc, "lookup", lambda **kwargs: judge_candidate())
    monkeypatch.setattr(sc, "store", lambda **kwargs: None)
    monkeypatch.setattr(sc, "release", lambda *args: None)

    with patch("app.services.suggest_reply._judge_equivalent") as judge:
        sr.suggest_reply(request_for())

    judge.assert_not_called()


def test_an_approving_judge_reuses_the_answer_and_caches_it(cache_on, monkeypatch):
    monkeypatch.setattr(sc, "lookup", lambda **kwargs: judge_candidate())
    monkeypatch.setattr(sr.get_settings(), "SEMANTIC_JUDGE_ENABLED", True, raising=False)

    stored = {}
    monkeypatch.setattr(sc, "store", lambda **kwargs: stored.update(kwargs))
    monkeypatch.setattr(sr, "retrieve", MagicMock())

    with patch("app.services.suggest_reply._judge_equivalent", return_value=True):
        result = sr.suggest_reply(request_for("I can't remember my password"))

    assert result.suggested_reply == "Go to Settings > Security."
    assert stored["lease_id"] == "lease-9"


def test_a_rejecting_judge_falls_through_to_the_pipeline(cache_on, monkeypatch, fake_vector_store):
    monkeypatch.setattr(sc, "lookup", lambda **kwargs: judge_candidate())
    monkeypatch.setattr(sr.get_settings(), "SEMANTIC_JUDGE_ENABLED", True, raising=False)
    monkeypatch.setattr(sc, "store", lambda **kwargs: None)
    monkeypatch.setattr(sc, "release", lambda *args: None)

    retrieve = MagicMock(return_value=[])
    monkeypatch.setattr(sr, "retrieve", retrieve)

    with patch("app.services.suggest_reply._judge_equivalent", return_value=False):
        sr.suggest_reply(request_for())

    retrieve.assert_called_once()


# ============================================================================
# CACHE IDENTITY
# ============================================================================


def test_payload_survives_a_round_trip():
    payload = sc.encode_payload("answer", 0.75, [{"article_id": "a1", "title": "T", "similarity": 0.9}])
    decoded = sc.decode_payload(payload)

    assert decoded["suggested_reply"] == "answer"
    assert decoded["confidence"] == 0.75
    assert decoded["source_articles"][0]["article_id"] == "a1"


def test_malformed_payloads_decode_to_none():
    assert sc.decode_payload("not json") is None
    assert sc.decode_payload('{"unexpected": true}') is None


def test_editing_the_prompt_changes_the_prompt_version():
    assert sc.prompt_version("prompt A") != sc.prompt_version("prompt B")
    assert sc.prompt_version("prompt A") == sc.prompt_version("prompt A")


def test_indexing_an_article_invalidates_that_orgs_cache(fake_vector_store, monkeypatch):
    from app.schemas import IndexArticleRequest
    from app.services import indexing

    invalidations = []
    monkeypatch.setattr(sc, "invalidate_org", lambda org_id, reason: invalidations.append((org_id, reason)))

    indexing.index_knowledge_article(
        IndexArticleRequest(org_id="org_a", article_id="art_1", title="T", content="Body", tags=[])
    )

    assert invalidations == [("org_a", "article_indexed")]


def test_deleting_an_article_invalidates_that_orgs_cache(fake_vector_store, monkeypatch):
    from app.services import indexing

    invalidations = []
    monkeypatch.setattr(sc, "invalidate_org", lambda org_id, reason: invalidations.append((org_id, reason)))

    indexing.remove_knowledge_article("art_1", "org_a")

    assert invalidations == [("org_a", "article_deleted")]
