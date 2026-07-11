import logging

from langchain_core.prompts import ChatPromptTemplate

from app.llm import get_chat_model
from app.schemas import (
    SourceArticle,
    SuggestReplyRequest,
    SuggestReplyResponse,
    TicketMessageInput,
)
from app.vector_store import retrieve

logger = logging.getLogger(__name__)

REPLY_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are drafting a suggested reply for a human support agent "
            "to review before sending. Use the provided knowledge-base "
            "excerpts when relevant. If no knowledge-base information is "
            "available, draft a cautious reply using only the conversation. "
            "Do not invent company policies, refund rules, prices, deadlines, "
            "or guarantees. Keep the reply concise and helpful.",
        ),
        (
            "human",
            "Conversation so far:\n{transcript}\n\n"
            "Relevant knowledge-base excerpts:\n{context}\n\n"
            "Draft the agent's next reply.",
        ),
    ]
)


def _format_transcript(messages: list[TicketMessageInput]) -> str:
    lines: list[str] = []

    for message in messages:
        if message.author_type == "system":
            continue

        speaker = {
            "customer": "Customer",
            "agent": "Agent",
            "ai": "AI",
        }.get(message.author_type, message.author_type)

        lines.append(f"{speaker}: {message.body}")

    return "\n".join(lines)


def _latest_customer_message(
    messages: list[TicketMessageInput],
) -> str:
    for message in reversed(messages):
        if message.author_type == "customer":
            return message.body

    return messages[-1].body if messages else ""


def _response_text(response: object) -> str:
    content = getattr(response, "content", "")

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts: list[str] = []

        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if text:
                    parts.append(str(text))

        return "\n".join(parts).strip()

    return str(content).strip()


def suggest_reply(
    request: SuggestReplyRequest,
) -> SuggestReplyResponse:
    transcript = _format_transcript(request.messages)
    query = _latest_customer_message(request.messages)

    nodes = []

    if query:
        try:
            nodes = retrieve(request.org_id, query)
        except Exception:
            # Qdrant failure should not stop Gemini suggestion generation.
            logger.exception(
                "Qdrant retrieval failed; continuing without KB context",
                extra={
                    "org_id": request.org_id,
                    "ticket_id": request.ticket_id,
                },
            )
            nodes = []

    if nodes:
        context = "\n\n---\n\n".join(
            (
                f"[{node.metadata.get('title', 'Untitled')}]\n"
                f"{node.get_content()}"
            )
            for node in nodes
        )
    else:
        context = (
            "No matching knowledge-base article was available. "
            "Use only the conversation. Do not invent company-specific "
            "policies or guarantees."
        )

    llm = get_chat_model()

    response = llm.invoke(
        REPLY_PROMPT.format_messages(
            transcript=transcript or "No conversation text supplied.",
            context=context,
        )
    )

    suggested_reply = _response_text(response)

    if not suggested_reply:
        raise RuntimeError("Gemini returned an empty suggested reply")

    if nodes:
        avg_similarity = (
            sum(float(node.score or 0.0) for node in nodes) / len(nodes)
        )
        confidence = round(
            max(0.0, min(1.0, avg_similarity)),
            3,
        )
    else:
        confidence = 0.0

    seen: dict[str, SourceArticle] = {}

    for node in nodes:
        article_id = node.metadata.get("article_id")

        if not article_id or article_id in seen:
            continue

        seen[article_id] = SourceArticle(
            article_id=str(article_id),
            title=str(node.metadata.get("title", "Untitled")),
            similarity=round(float(node.score or 0.0), 3),
        )

    return SuggestReplyResponse(
        suggested_reply=suggested_reply,
        confidence=confidence,
        source_articles=list(seen.values()),
    )