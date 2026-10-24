"""
Knowledge base indexing.

Any change here makes previously generated answers potentially stale, so each operation bumps
the org's knowledge base version in SemantiCache. That single bump retires every cached answer
for the org — an answer grounded in an article that has since been edited must not be reused.
"""

from app import semantic_cache
from app.schemas import DeleteArticleResponse, IndexArticleRequest, IndexArticleResponse
from app.vector_store import delete_article, index_article


def index_knowledge_article(request: IndexArticleRequest) -> IndexArticleResponse:
    chunks = index_article(
        org_id=request.org_id,
        article_id=request.article_id,
        title=request.title,
        content=request.content,
        tags=request.tags,
    )
    semantic_cache.invalidate_org(request.org_id, "article_indexed")
    return IndexArticleResponse(article_id=request.article_id, chunks_indexed=chunks)


def remove_knowledge_article(article_id: str, org_id: str | None = None) -> DeleteArticleResponse:
    delete_article(article_id)
    if org_id:
        semantic_cache.invalidate_org(org_id, "article_deleted")
    return DeleteArticleResponse(article_id=article_id, deleted=True)
