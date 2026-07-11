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
    return IndexArticleResponse(article_id=request.article_id, chunks_indexed=chunks)


def remove_knowledge_article(article_id: str) -> DeleteArticleResponse:
    delete_article(article_id)
    return DeleteArticleResponse(article_id=article_id, deleted=True)
