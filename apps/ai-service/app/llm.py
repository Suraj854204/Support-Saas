"""
Google Gemini is the only LLM/embedding backend this service uses. Kept as
thin factory functions (rather than inlined at every call site) so tests
can patch `get_chat_model` / `get_embedding_model` without needing a real
API key or network access.
"""

from functools import lru_cache

from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel

from app.config import get_settings


@lru_cache
def get_chat_model() -> BaseChatModel:
    from langchain_google_genai import ChatGoogleGenerativeAI

    settings = get_settings()
    return ChatGoogleGenerativeAI(
        model=settings.GEMINI_CHAT_MODEL,
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=0.2,
    )


@lru_cache
def get_embedding_model() -> Embeddings:
    from langchain_google_genai import GoogleGenerativeAIEmbeddings

    settings = get_settings()
    return GoogleGenerativeAIEmbeddings(
        model=settings.GEMINI_EMBEDDING_MODEL,
        google_api_key=settings.GOOGLE_API_KEY,
    )
