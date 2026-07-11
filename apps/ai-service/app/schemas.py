from typing import Literal

from pydantic import BaseModel, Field



# Knowledge base indexing



class IndexArticleRequest(BaseModel):
    org_id: str
    article_id: str
    title: str
    content: str
    tags: list[str] = Field(default_factory=list)


class IndexArticleResponse(BaseModel):
    article_id: str
    chunks_indexed: int


class DeleteArticleResponse(BaseModel):
    article_id: str
    deleted: bool

# Summarization + sentiment



class TicketMessageInput(BaseModel):
    author_type: Literal["customer", "agent", "ai", "system"]
    body: str


class SummarizeRequest(BaseModel):
    org_id: str
    ticket_id: str
    messages: list[TicketMessageInput]


class SummarizeResponse(BaseModel):
    summary: str
    sentiment: Literal["positive", "neutral", "negative"]


# Suggested replies (RAG)



class SuggestReplyRequest(BaseModel):
    org_id: str
    ticket_id: str
    messages: list[TicketMessageInput]


class SourceArticle(BaseModel):
    article_id: str
    title: str
    similarity: float


class SuggestReplyResponse(BaseModel):
    suggested_reply: str
    confidence: float = Field(ge=0, le=1)
    source_articles: list[SourceArticle]
