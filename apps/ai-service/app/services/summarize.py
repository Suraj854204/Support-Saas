from typing import Literal

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel

from app.llm import get_chat_model
from app.schemas import SummarizeResponse, TicketMessageInput

SUMMARY_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a support-ticket analyst. Read the conversation transcript and produce a "
            "one-to-two sentence summary an agent can read in three seconds, plus the customer's "
            "overall sentiment. Be factual — do not invent details not present in the transcript.",
        ),
        ("human", "Transcript:\n\n{transcript}"),
    ]
)


class _SummaryResult(BaseModel):
    summary: str
    sentiment: Literal["positive", "neutral", "negative"]


def _format_transcript(messages: list[TicketMessageInput]) -> str:
    lines = []
    for m in messages:
        if m.author_type == "system":
            continue
        speaker = {"customer": "Customer", "agent": "Agent", "ai": "AI"}.get(m.author_type, m.author_type)
        lines.append(f"{speaker}: {m.body}")
    return "\n".join(lines)


def summarize_ticket(messages: list[TicketMessageInput]) -> SummarizeResponse:
    transcript = _format_transcript(messages)

    if not transcript.strip():
        return SummarizeResponse(summary="No conversation content yet.", sentiment="neutral")

    llm = get_chat_model()
    structured_llm = llm.with_structured_output(_SummaryResult)
    result: _SummaryResult = structured_llm.invoke(SUMMARY_PROMPT.format_messages(transcript=transcript))

    return SummarizeResponse(summary=result.summary, sentiment=result.sentiment)
