import hmac

from fastapi import Header, HTTPException

from app.config import get_settings


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """Only the API gateway may call the AI service.

    With no token configured (local development) the check is skipped; production refuses to
    start without one (see assert_production_ready), so it can never silently run open.
    """
    expected = get_settings().AI_SERVICE_TOKEN
    if not expected:
        return
    if not x_internal_token or not hmac.compare_digest(x_internal_token.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


def assert_production_ready() -> None:
    settings = get_settings()
    if settings.ENVIRONMENT == "production" and len(settings.AI_SERVICE_TOKEN) < 24:
        raise RuntimeError("AI_SERVICE_TOKEN must be set (at least 24 chars) when ENVIRONMENT=production")
