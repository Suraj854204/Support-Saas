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
        raw = (h * (768 // len(h) + 1))[:768]
        return [b / 255.0 for b in raw]

    def embed_documents(self, texts):
        return [self._vec(t) for t in texts]

    def embed_query(self, text):
        return self._vec(text)


@pytest.fixture
def fake_vector_store():
    """Patches the vector store module to use an in-memory Qdrant client
    and deterministic embeddings, then resets its lru_cache'd singletons."""
    import app.vector_store as vs

    mock_client = QdrantClient(":memory:")
    fake_embeddings = FakeEmbeddings()

    with patch("app.vector_store.get_qdrant_client", return_value=mock_client), patch(
        "app.vector_store.get_embedding_model", return_value=fake_embeddings
    ):
        vs.get_qdrant_client.cache_clear()
        vs.get_vector_store.cache_clear()
        vs.get_index.cache_clear()
        yield vs


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)
