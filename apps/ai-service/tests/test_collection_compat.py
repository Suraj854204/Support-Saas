import pytest
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from unittest.mock import patch

import app.vector_store as vs
from app.config import get_settings


def _client_with_collection(size: int) -> QdrantClient:
    client = QdrantClient(":memory:")
    client.create_collection(
        get_settings().QDRANT_COLLECTION,
        vectors_config=qmodels.VectorParams(size=size, distance=qmodels.Distance.COSINE),
    )
    return client


def test_incompatible_existing_collection_is_refused_not_reused():
    client = _client_with_collection(get_settings().QDRANT_VECTOR_SIZE + 1)
    with patch("app.vector_store.get_qdrant_client", return_value=client):
        with pytest.raises(vs.IncompatibleCollectionError, match="re-index"):
            vs.ensure_collection()


def test_matching_collection_is_accepted():
    client = _client_with_collection(get_settings().QDRANT_VECTOR_SIZE)
    with patch("app.vector_store.get_qdrant_client", return_value=client):
        vs.ensure_collection()


def test_missing_collection_is_created_with_configured_size():
    client = QdrantClient(":memory:")
    with patch("app.vector_store.get_qdrant_client", return_value=client):
        vs.ensure_collection()
    assert client.get_collection(get_settings().QDRANT_COLLECTION).config.params.vectors.size == get_settings().QDRANT_VECTOR_SIZE
