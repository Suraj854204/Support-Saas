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

    # --- SemantiCache (Java semantic response cache in front of RAG + LLM) ---
    # Disabling this, or the service being unreachable, leaves the RAG pipeline exactly as it
    # was before the cache existed.
    SEMANTIC_CACHE_ENABLED: bool = True
    SEMANTIC_CACHE_URL: str = "http://localhost:8081"
    SEMANTIC_CACHE_SERVICE_TOKEN: str = ""
    SEMANTIC_CACHE_CONNECT_TIMEOUT_SECONDS: float = 1.0
    # Generous on purpose: a coalesced request is held open until the owner's answer lands.
    SEMANTIC_CACHE_READ_TIMEOUT_SECONDS: float = 50.0
    # Bump manually when the provider changes a model behind a stable name.
    SEMANTIC_CACHE_MODEL_VERSION: str = "1"
    # Optional second opinion on borderline semantic matches. One cheap LLM call instead of a
    # full retrieval + generation, so it only pays off if the judge is materially cheaper.
    SEMANTIC_JUDGE_ENABLED: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
