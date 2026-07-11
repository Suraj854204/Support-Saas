def test_health_endpoint(client, monkeypatch):
    class FakeQdrantClient:
        def get_collections(self):
            return {"collections": []}

    monkeypatch.setattr(
        "app.main.get_qdrant_client",
        lambda: FakeQdrantClient(),
    )

    res = client.get("/health")

    assert res.status_code == 200

    body = res.json()

    assert body["status"] == "ok"
    assert body["service"] == "ai-service"
    assert body["qdrant"] == "connected"


def test_health_endpoint_returns_degraded_when_qdrant_is_down(
    client,
    monkeypatch,
):
    class BrokenQdrantClient:
        def get_collections(self):
            raise ConnectionError("Qdrant unavailable")

    monkeypatch.setattr(
        "app.main.get_qdrant_client",
        lambda: BrokenQdrantClient(),
    )

    res = client.get("/health")

    assert res.status_code == 200

    body = res.json()

    assert body["status"] == "degraded"
    assert body["service"] == "ai-service"
    assert body["qdrant"] == "unavailable"


def test_summarize_empty_messages_via_http(client):
    res = client.post(
        "/ai/summarize",
        json={
            "org_id": "org1",
            "ticket_id": "t1",
            "messages": [],
        },
    )

    assert res.status_code == 200

    body = res.json()

    assert body["sentiment"] == "neutral"


def test_summarize_rejects_invalid_author_type(client):
    res = client.post(
        "/ai/summarize",
        json={
            "org_id": "org1",
            "ticket_id": "t1",
            "messages": [
                {
                    "author_type": "not-a-real-type",
                    "body": "hi",
                }
            ],
        },
    )

    assert res.status_code == 422


def test_index_article_without_qdrant_returns_clean_502(client):
    res = client.post(
        "/ai/index/article",
        json={
            "org_id": "org1",
            "article_id": "a1",
            "title": "T",
            "content": "C",
            "tags": [],
        },
    )

    assert res.status_code == 502
    assert "detail" in res.json()