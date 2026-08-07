from fastapi import APIRouter, HTTPException

from app.schemas import (
    DeleteArticleResponse,
    IndexArticleRequest,
    IndexArticleResponse,
    SummarizeRequest,
    SummarizeResponse,
    SuggestReplyRequest,
    SuggestReplyResponse,
)
from app.services.indexing import index_knowledge_article, remove_knowledge_article
from app.services.suggest_reply import suggest_reply as suggest_reply_service
from app.services.summarize import summarize_ticket

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/index/article", response_model=IndexArticleResponse)
def index_article(payload: IndexArticleRequest) -> IndexArticleResponse:
    try:
        return index_knowledge_article(payload)
    except Exception as exc:  # noqa: BLE001 — surfaced as a clean 502 to the caller
        raise HTTPException(status_code=502, detail=f"Indexing failed: {exc}") from exc


@router.delete("/index/article/{article_id}", response_model=DeleteArticleResponse)
def delete_article(article_id: str) -> DeleteArticleResponse:
    try:
        return remove_knowledge_article(article_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Delete failed: {exc}") from exc


@router.post("/summarize", response_model=SummarizeResponse)
def summarize(payload: SummarizeRequest) -> SummarizeResponse:
    try:
        return summarize_ticket(payload.messages)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Summarization failed: {exc}") from exc


@router.post("/suggest-reply", response_model=SuggestReplyResponse)
def suggest_reply(payload: SuggestReplyRequest) -> SuggestReplyResponse:
    try:
        return suggest_reply_service(payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Suggestion failed: {exc}") from exc
