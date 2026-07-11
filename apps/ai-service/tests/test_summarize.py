from unittest.mock import MagicMock, patch

from app.schemas import TicketMessageInput
from app.services.summarize import summarize_ticket, _format_transcript


def test_summarize_short_circuits_on_empty_messages():
    result = summarize_ticket([])
    assert result.sentiment == "neutral"
    assert "no conversation" in result.summary.lower()


def test_summarize_skips_system_messages_in_transcript():
    messages = [
        TicketMessageInput(author_type="system", body="Ticket created"),
        TicketMessageInput(author_type="customer", body="Help please"),
    ]
    transcript = _format_transcript(messages)
    assert "Ticket created" not in transcript
    assert "Help please" in transcript


def test_summarize_calls_structured_llm_and_maps_result():
    fake_structured_llm = MagicMock()
    fake_structured_llm.invoke.return_value = MagicMock(summary="Customer can't log in.", sentiment="negative")

    fake_llm = MagicMock()
    fake_llm.with_structured_output.return_value = fake_structured_llm

    with patch("app.services.summarize.get_chat_model", return_value=fake_llm):
        result = summarize_ticket([TicketMessageInput(author_type="customer", body="I can't log in at all!")])

    assert result.summary == "Customer can't log in."
    assert result.sentiment == "negative"
    fake_structured_llm.invoke.assert_called_once()
