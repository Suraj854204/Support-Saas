import hashlib
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from langchain_core.embeddings import Embeddings
from qdrant_client import QdrantClient

sys.path.insert(0, str(Path(__file__).parent.parent))


class FakeEmbeddings(Embeddings):
    """Deterministic embeddings: hash text -> fixed-size float vector.
    Lets the retrieval/indexing tests run without any network access."""

    def _vec(self, text: str):
        h = hashlib.sha256(text.encode()).digest()
        from app.config import get_settings

        dim = get_settings().QDRANT_VECTOR_SIZE
        raw = (h * (dim // len(h) + 1))[:dim]
        return [b / 255.0 for b in raw]

    def embed_documents(self, texts):
        return [self._vec(t) for t in texts]

    def embed_query(self, text):
        return self._vec(text)


@pytest.fixture
def fake_vector_store(monkeypatch):
    """Patches the vector store module to use an in-memory Qdrant client
    and deterministic embeddings, then resets its lru_cache'd singletons."""
    import app.vector_store as vs

    mock_client = QdrantClient(":memory:")
    fake_embeddings = FakeEmbeddings()

    # Hash-based fake vectors have arbitrary similarity (~0.6), far from a real embedding model's.
    # The UI source-display threshold is tuned on real scores, so these retrieval/grounding tests
    # disable it; the threshold itself is covered by test_source_threshold_hides_weak_matches.
    import app.services.suggest_reply as sr

    monkeypatch.setattr(sr, "SOURCE_MIN_SIMILARITY", 0.0)

    with patch("app.vector_store.get_qdrant_client", return_value=mock_client), patch(
        "app.vector_store.get_embedding_model", return_value=fake_embeddings
    ):
        vs.get_qdrant_client.cache_clear()
        vs.get_vector_store.cache_clear()
        vs.get_index.cache_clear()
        yield vs


@pytest.fixture(autouse=True)
def semantic_cache_off(monkeypatch):
    """The existing suite exercises the RAG path, so the semantic cache is opt-in per test.
    This also keeps the suite from reaching out to a service that is not running."""
    import app.semantic_cache as sc

    monkeypatch.setattr(sc, "is_enabled", lambda: False)
    yield


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)
