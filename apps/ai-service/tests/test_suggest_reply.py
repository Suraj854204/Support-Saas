from unittest.mock import MagicMock, patch

import app.services.suggest_reply as sr
from app.schemas import SuggestReplyRequest, TicketMessageInput


def test_suggest_reply_grounds_answer_in_retrieved_article(fake_vector_store):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Password reset",
        "To reset your password, visit Settings > Security and click Reset.",
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
        request = SuggestReplyRequest(
            org_id="org_a",
            ticket_id="t1",
            messages=[
                TicketMessageInput(
                    author_type="customer",
                    body="I can't remember my password",
                )
            ],
        )

        result = sr.suggest_reply(request)

    assert result.source_articles
    assert result.source_articles[0].article_id == "art_1"
    assert result.source_articles[0].title == "Password reset"

    assert 0.0 <= result.confidence <= 1.0

    assert "Settings" in result.suggested_reply
    assert "Security" in result.suggested_reply
    assert "Reset" in result.suggested_reply

    fake_llm.invoke.assert_called_once()


def test_suggest_reply_falls_back_when_no_kb_match(fake_vector_store):
    request = SuggestReplyRequest(
        org_id="org_empty",
        ticket_id="t2",
        messages=[
            TicketMessageInput(
                author_type="customer",
                body="What is the weather today?",
            )
        ],
    )

    with patch(
        "app.services.suggest_reply.get_chat_model"
    ) as mock_get_chat_model:
        result = sr.suggest_reply(request)

    assert result.confidence == 0.0
    assert result.source_articles == []

    assert (
        "human agent" in result.suggested_reply.lower()
    )

    # LLM should never be called when KB retrieval has no relevant result.
    mock_get_chat_model.assert_not_called()


def test_latest_customer_message_is_used_instead_of_agent_message(
    fake_vector_store,
):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Billing",
        "Invoices are generated on the 1st of each month.",
        [],
    )

    request = SuggestReplyRequest(
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

    query = sr._latest_customer_message(request.messages)

    assert query == "When am I billed?"


def test_latest_customer_message_returns_most_recent_customer_message():
    messages = [
        TicketMessageInput(
            author_type="customer",
            body="My first question",
        ),
        TicketMessageInput(
            author_type="agent",
            body="Thanks, let me check.",
        ),
        TicketMessageInput(
            author_type="customer",
            body="Actually, I mean my billing date.",
        ),
    ]

    result = sr._latest_customer_message(messages)

    assert result == "Actually, I mean my billing date."


def test_latest_customer_message_falls_back_to_last_message():
    messages = [
        TicketMessageInput(
            author_type="agent",
            body="How can I help?",
        ),
        TicketMessageInput(
            author_type="agent",
            body="Are you still there?",
        ),
    ]

    result = sr._latest_customer_message(messages)

    assert result == "Are you still there?"


def test_latest_customer_message_returns_empty_for_empty_messages():
    result = sr._latest_customer_message([])

    assert result == ""


def test_system_messages_are_excluded_from_transcript():
    messages = [
        TicketMessageInput(
            author_type="system",
            body="Ticket created",
        ),
        TicketMessageInput(
            author_type="customer",
            body="I cannot log in.",
        ),
        TicketMessageInput(
            author_type="agent",
            body="Let me help.",
        ),
    ]

    result = sr._format_transcript(messages)

    assert "Ticket created" not in result
    assert "Customer: I cannot log in." in result
    assert "Agent: Let me help." in result


def test_empty_messages_are_excluded_from_transcript():
    messages = [
        TicketMessageInput(
            author_type="customer",
            body="   ",
        ),
        TicketMessageInput(
            author_type="agent",
            body="",
        ),
        TicketMessageInput(
            author_type="customer",
            body="I need help.",
        ),
    ]

    result = sr._format_transcript(messages)

    assert result == "Customer: I need help."


def test_llm_response_does_not_include_kb_title(
    fake_vector_store,
):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Password Reset Instructions",
        "Go to Settings > Security and click Reset.",
        [],
    )

    fake_llm = MagicMock()
    fake_llm.invoke.return_value = MagicMock(
        content=(
            "Go to Settings > Security and click Reset.\n\n"
            "Password Reset Instructions"
        )
    )

    with patch(
        "app.services.suggest_reply.get_chat_model",
        return_value=fake_llm,
    ):
        request = SuggestReplyRequest(
            org_id="org_a",
            ticket_id="t4",
            messages=[
                TicketMessageInput(
                    author_type="customer",
                    body="I forgot my password.",
                )
            ],
        )

        result = sr.suggest_reply(request)

    assert "Settings > Security" in result.suggested_reply
    assert "Password Reset Instructions" not in result.suggested_reply


def test_llm_sources_section_is_removed(fake_vector_store):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Password Reset",
        "Go to Settings > Security and click Reset.",
        [],
    )

    fake_llm = MagicMock()
    fake_llm.invoke.return_value = MagicMock(
        content=(
            "Go to Settings > Security and click Reset.\n\n"
            "Sources\n"
            "- Password Reset\n"
            "- Account Security"
        )
    )

    with patch(
        "app.services.suggest_reply.get_chat_model",
        return_value=fake_llm,
    ):
        request = SuggestReplyRequest(
            org_id="org_a",
            ticket_id="t5",
            messages=[
                TicketMessageInput(
                    author_type="customer",
                    body="I forgot my password.",
                )
            ],
        )

        result = sr.suggest_reply(request)

    assert "Settings > Security" in result.suggested_reply
    assert "Sources" not in result.suggested_reply
    assert "Account Security" not in result.suggested_reply


def test_llm_internal_metadata_is_removed(fake_vector_store):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Password Reset",
        "Go to Settings > Security and click Reset.",
        [],
    )

    fake_llm = MagicMock()
    fake_llm.invoke.return_value = MagicMock(
        content=(
            "Go to Settings > Security and click Reset.\n\n"
            "Knowledge Base Article 1\n"
            "Similarity Score: 0.91\n"
            "Qdrant\n"
            "Gemini"
        )
    )

    with patch(
        "app.services.suggest_reply.get_chat_model",
        return_value=fake_llm,
    ):
        request = SuggestReplyRequest(
            org_id="org_a",
            ticket_id="t6",
            messages=[
                TicketMessageInput(
                    author_type="customer",
                    body="I forgot my password.",
                )
            ],
        )

        result = sr.suggest_reply(request)

    assert "Settings > Security" in result.suggested_reply

    assert "Knowledge Base Article" not in result.suggested_reply
    assert "Similarity Score" not in result.suggested_reply
    assert "Qdrant" not in result.suggested_reply
    assert "Gemini" not in result.suggested_reply


def test_empty_llm_response_falls_back_after_retries(
    fake_vector_store,
):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Password Reset",
        "Go to Settings > Security and click Reset.",
        [],
    )

    fake_llm = MagicMock()
    fake_llm.invoke.return_value = MagicMock(content="")

    with patch(
        "app.services.suggest_reply.get_chat_model",
        return_value=fake_llm
    ), patch(
        "app.services.suggest_reply.time.sleep"
    ):
        request = SuggestReplyRequest(
            org_id="org_a",
            ticket_id="t7",
            messages=[
                TicketMessageInput(
                    author_type="customer",
                    body="I forgot my password.",
                )
            ],
        )

        result = sr.suggest_reply(request)

    assert (
        result.suggested_reply
        == sr.FALLBACK_REPLY
    )

    assert fake_llm.invoke.call_count == sr.LLM_MAX_ATTEMPTS


def test_llm_exception_falls_back_after_retries(
    fake_vector_store,
):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Password Reset",
        "Go to Settings > Security and click Reset.",
        [],
    )

    fake_llm = MagicMock()
    fake_llm.invoke.side_effect = RuntimeError("LLM unavailable")

    with patch(
        "app.services.suggest_reply.get_chat_model",
        return_value=fake_llm
    ), patch(
        "app.services.suggest_reply.time.sleep"
    ):
        request = SuggestReplyRequest(
            org_id="org_a",
            ticket_id="t8",
            messages=[
                TicketMessageInput(
                    author_type="customer",
                    body="I forgot my password.",
                )
            ],
        )

        result = sr.suggest_reply(request)

    assert result.suggested_reply == sr.FALLBACK_REPLY
    assert result.confidence > 0.0

    assert fake_llm.invoke.call_count == sr.LLM_MAX_ATTEMPTS


def test_false_negative_llm_response_is_retried(
    fake_vector_store,
):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Password Reset",
        "Go to Settings > Security and click Reset.",
        [],
    )

    fake_llm = MagicMock()

    fake_llm.invoke.side_effect = [
        MagicMock(content=sr.FALLBACK_REPLY),
        MagicMock(
            content="Go to Settings > Security and click Reset."
        ),
    ]

    with patch(
        "app.services.suggest_reply.get_chat_model",
        return_value=fake_llm
    ), patch(
        "app.services.suggest_reply.time.sleep"
    ):
        request = SuggestReplyRequest(
            org_id="org_a",
            ticket_id="t9",
            messages=[
                TicketMessageInput(
                    author_type="customer",
                    body="I forgot my password.",
                )
            ],
        )

        result = sr.suggest_reply(request)

    assert "Settings > Security" in result.suggested_reply
    assert fake_llm.invoke.call_count == 2


def test_source_articles_are_deduplicated(
    fake_vector_store,
):
    fake_vector_store.index_article(
        "org_a",
        "art_1",
        "Password Reset",
        "Go to Settings > Security and click Reset.",
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
        request = SuggestReplyRequest(
            org_id="org_a",
            ticket_id="t10",
            messages=[
                TicketMessageInput(
                    author_type="customer",
                    body="I forgot my password.",
                )
            ],
        )

        result = sr.suggest_reply(request)

    article_ids = [
        article.article_id
        for article in result.source_articles
    ]

    assert len(article_ids) == len(set(article_ids))