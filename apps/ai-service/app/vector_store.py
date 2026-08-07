"""
LlamaIndex owns chunking, embedding, and retrieval against Qdrant. Every
point is tagged with org_id in its payload and every query applies an
org_id filter, so tenants never retrieve each other's knowledge base
content even though they share one Qdrant collection.
"""

from functools import lru_cache

from llama_index.core import StorageContext, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import TextNode
from llama_index.core.vector_stores import ExactMatchFilter, MetadataFilters
from llama_index.embeddings.langchain import LangchainEmbedding
from llama_index.vector_stores.qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.config import get_settings
from app.llm import get_embedding_model

CHUNK_SIZE = 512
CHUNK_OVERLAP = 64


@lru_cache
def get_qdrant_client() -> QdrantClient:
    return QdrantClient(url=get_settings().QDRANT_URL)


def ensure_collection() -> None:
    settings = get_settings()
    client = get_qdrant_client()

    if not client.collection_exists(settings.QDRANT_COLLECTION):
        client.create_collection(
            collection_name=settings.QDRANT_COLLECTION,
            vectors_config=qmodels.VectorParams(
                size=settings.QDRANT_VECTOR_SIZE,
                distance=qmodels.Distance.COSINE,
            ),
        )


@lru_cache
def get_vector_store() -> QdrantVectorStore:
    ensure_collection()
    return QdrantVectorStore(client=get_qdrant_client(), collection_name=get_settings().QDRANT_COLLECTION)


@lru_cache
def get_index() -> VectorStoreIndex:
    embed_model = LangchainEmbedding(get_embedding_model())
    storage_context = StorageContext.from_defaults(vector_store=get_vector_store())
    return VectorStoreIndex.from_vector_store(
        get_vector_store(), storage_context=storage_context, embed_model=embed_model
    )


def index_article(org_id: str, article_id: str, title: str, content: str, tags: list[str]) -> int:
    """Chunks and (re-)embeds a knowledge article. Safe to call on updates —
    old chunks for this article_id are deleted first."""
    delete_article(article_id)

    splitter = SentenceSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks = splitter.split_text(content)

    nodes = [
        TextNode(
            text=chunk,
            metadata={"org_id": org_id, "article_id": article_id, "title": title, "tags": tags},
        )
        for chunk in chunks
    ]

    index = get_index()
    index.insert_nodes(nodes)
    return len(nodes)


def delete_article(article_id: str) -> None:
    ensure_collection()
    client = get_qdrant_client()
    settings = get_settings()
    client.delete(
        collection_name=settings.QDRANT_COLLECTION,
        points_selector=qmodels.FilterSelector(
            filter=qmodels.Filter(
                must=[qmodels.FieldCondition(key="article_id", match=qmodels.MatchValue(value=article_id))]
            )
        ),
    )


def retrieve(org_id: str, query_text: str, top_k: int | None = None):
    """Returns LlamaIndex NodeWithScore results, scoped to one organization."""
    settings = get_settings()
    index = get_index()
    retriever = index.as_retriever(
        similarity_top_k=top_k or settings.RETRIEVAL_TOP_K,
        filters=MetadataFilters(filters=[ExactMatchFilter(key="org_id", value=org_id)]),
    )
    return retriever.retrieve(query_text)
