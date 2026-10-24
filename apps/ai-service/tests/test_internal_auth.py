import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.security import assert_production_ready


@pytest.fixture
def secured(monkeypatch):
    monkeypatch.setattr(get_settings(), "AI_SERVICE_TOKEN", "x" * 32)
    yield TestClient(app)


def test_ai_routes_reject_missing_or_wrong_token(secured):
    body = {"org_id": "o", "ticket_id": "t", "messages": []}
    assert secured.post("/ai/summarize", json=body).status_code == 401
    assert secured.post("/ai/summarize", json=body, headers={"X-Internal-Token": "wrong"}).status_code == 401


def test_ai_routes_accept_correct_token(secured):
    body = {"org_id": "o", "ticket_id": "t", "messages": []}
    assert secured.post("/ai/summarize", json=body, headers={"X-Internal-Token": "x" * 32}).status_code == 200


def test_health_stays_open(secured):
    assert secured.get("/health").status_code == 200


def test_production_refuses_to_start_without_token(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "AI_SERVICE_TOKEN", "")
    with pytest.raises(RuntimeError):
        assert_production_ready()
