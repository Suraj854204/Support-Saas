from unittest.mock import MagicMock, patch

from app.schemas import SuggestReplyRequest, TicketMessageInput
from app.services import suggest_reply as sr


def test_suggest_reply_grounds_answer_in_retrieved_article(
    fake_vector_store,
):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Password reset",
        (
            "To reset your password, visit Settings > Security "
            "and click Reset."
        ),
        [],
    )

    fake_llm = MagicMock()
    fake_llm.invoke.return_value = MagicMock(
        content="Go to Settings > Security and click Reset."
    )

    with patch(
        "app.services.suggest_reply.get_chat_model",
        return_value=fake_llm,
    ):
        req = SuggestReplyRequest(
            org_id="org_a",
            ticket_id="t1",
            messages=[
                TicketMessageInput(
                    author_type="customer",
                    body="I can't remember my password",
                )
            ],
        )

        result = sr.suggest_reply(req)

    assert result.source_articles[0].article_id == "art_1"
    assert 0 <= result.confidence <= 1
    assert "Settings" in result.suggested_reply
    fake_llm.invoke.assert_called_once()


def test_suggest_reply_falls_back_gracefully_with_no_kb_match(
    fake_vector_store,
):
    req = SuggestReplyRequest(
        org_id="org_empty",
        ticket_id="t2",
        messages=[
            TicketMessageInput(
                author_type="customer",
                body="unrelated question",
            )
        ],
    )

    result = sr.suggest_reply(req)

    assert result.confidence == 0.0
    assert result.source_articles == []
    assert result.suggested_reply
    assert result.suggested_reply.strip()


def test_suggest_reply_uses_latest_customer_message_not_agent_message(
    fake_vector_store,
):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Billing",
        "Invoices are generated on the 1st of each month.",
        [],
    )

    req = SuggestReplyRequest(
        org_id="org_a",
        ticket_id="t3",
        messages=[
            TicketMessageInput(
                author_type="customer",
                body="When am I billed?",
            ),
            TicketMessageInput(
                author_type="agent",
                body="Let me check that for you.",
            ),
        ],
    )

    query = sr._latest_customer_message(req.messages)

    assert query == "When am I billed?"