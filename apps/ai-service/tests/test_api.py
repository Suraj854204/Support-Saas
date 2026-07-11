def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "ai-service"


def test_summarize_empty_messages_via_http(client):
    res = client.post("/ai/summarize", json={"org_id": "org1", "ticket_id": "t1", "messages": []})
    assert res.status_code == 200
    body = res.json()
    assert body["sentiment"] == "neutral"


def test_summarize_rejects_invalid_author_type(client):
    res = client.post(
        "/ai/summarize",
        json={"org_id": "org1", "ticket_id": "t1", "messages": [{"author_type": "not-a-real-type", "body": "hi"}]},
    )
    assert res.status_code == 422  # Pydantic validation error, not a 500


def test_index_article_without_qdrant_returns_clean_502(client):
    # No Qdrant reachable in the test environment — should fail cleanly, not crash.
    res = client.post(
        "/ai/index/article",
        json={"org_id": "org1", "article_id": "a1", "title": "T", "content": "C", "tags": []},
    )
    assert res.status_code == 502
    assert "detail" in res.json()
