import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.ai import router as ai_router
from app.vector_store import get_qdrant_client

logging.basicConfig(
    level=logging.INFO,
    format=(
        "%(asctime)s | %(levelname)s | "
        "%(name)s | %(message)s"
    ),
)

logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(
    title="Support SaaS — AI Service",
    description=(
        "RAG-backed ticket summarization, sentiment, "
        "and suggested replies."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router)


@app.get("/health")
def health() -> dict:
    qdrant_status = "connected"

    try:
        get_qdrant_client().get_collections()
    except Exception as exc:
        qdrant_status = "unavailable"
        logger.warning("Qdrant health check failed: %s", exc)

    overall_status = (
        "ok"
        if qdrant_status == "connected"
        else "degraded"
    )

    return {
        "status": overall_status,
        "service": settings.SERVICE_NAME,
        "llm": settings.GEMINI_CHAT_MODEL,
        "embeddings": settings.GEMINI_EMBEDDING_MODEL,
        "qdrant": qdrant_status,
    }