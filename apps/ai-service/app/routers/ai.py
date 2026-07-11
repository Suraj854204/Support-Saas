import logging

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.schemas import (
    DeleteArticleResponse,
    IndexArticleRequest,
    IndexArticleResponse,
    SummarizeRequest,
    SummarizeResponse,
    SuggestReplyRequest,
    SuggestReplyResponse,
)
from app.services.indexing import (
    index_knowledge_article,
    remove_knowledge_article,
)
from app.services.suggest_reply import (
    suggest_reply as suggest_reply_service,
)
from app.services.summarize import summarize_ticket

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


def _handle_service_error(
    operation: str,
    exc: Exception,
) -> HTTPException:
    logger.exception(
        "%s failed: %s",
        operation,
        exc,
    )

    settings = get_settings()

    if settings.ENVIRONMENT == "development":
        detail = (
            f"{operation} failed: "
            f"{type(exc).__name__}: {str(exc)}"
        )
    else:
        detail = f"{operation} failed"

    return HTTPException(
        status_code=502,
        detail=detail,
    )


@router.post(
    "/index/article",
    response_model=IndexArticleResponse,
)
def index_article(
    payload: IndexArticleRequest,
) -> IndexArticleResponse:
    try:
        return index_knowledge_article(payload)
    except Exception as exc:
        raise _handle_service_error(
            "Knowledge article indexing",
            exc,
        ) from exc


@router.delete(
    "/index/article/{article_id}",
    response_model=DeleteArticleResponse,
)
def delete_article(
    article_id: str,
) -> DeleteArticleResponse:
    try:
        return remove_knowledge_article(article_id)
    except Exception as exc:
        raise _handle_service_error(
            "Knowledge article deletion",
            exc,
        ) from exc


@router.post(
    "/summarize",
    response_model=SummarizeResponse,
)
def summarize(
    payload: SummarizeRequest,
) -> SummarizeResponse:
    try:
        return summarize_ticket(payload.messages)
    except Exception as exc:
        raise _handle_service_error(
            "Ticket summarization",
            exc,
        ) from exc


@router.post(
    "/suggest-reply",
    response_model=SuggestReplyResponse,
)
def suggest_reply(
    payload: SuggestReplyRequest,
) -> SuggestReplyResponse:
    try:
        return suggest_reply_service(payload)
    except Exception as exc:
        raise _handle_service_error(
            "Reply suggestion",
            exc,
        ) from exc