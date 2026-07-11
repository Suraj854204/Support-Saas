from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration, loaded from environment variables (.env in dev)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Service ---
    SERVICE_NAME: str = "ai-service"
    AI_SERVICE_PORT: int = 8000
    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:4000"

    # --- Google Gemini ---
    GOOGLE_API_KEY: str = ""
    GEMINI_CHAT_MODEL: str = "gemini-2.5-flash"
    GEMINI_EMBEDDING_MODEL: str = "models/text-embedding-004"

    # --- Vector store ---
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION: str = "knowledge_articles"
    QDRANT_VECTOR_SIZE: int = 768  # matches models/text-embedding-004

    # --- Retrieval tuning ---
    RETRIEVAL_TOP_K: int = 4
    MIN_CONFIDENCE_SIMILARITY: float = 0.55

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
