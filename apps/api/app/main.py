import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.redis import _pool as redis_pool
from app.db.redis import get_redis
from app.db.session import engine, get_db

settings = get_settings()
_started_at = datetime.now(tz=timezone.utc)

VERSION = "0.1.0"

_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _log.info("Protin API v%s starting — env=%s", VERSION, settings.app_env)
    from app.core.encryption import validate_encryption_config

    validate_encryption_config()
    _log.info("App is ready.")
    yield
    await engine.dispose()
    await redis_pool.aclose()


app = FastAPI(
    title="Protin API",
    version=VERSION,
    lifespan=lifespan,
)

_cors_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["*"],
    allow_credentials=bool(_cors_origins),  # credentials require explicit origins
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
async def health(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> JSONResponse:
    checks: dict[str, str] = {}

    try:
        await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"

    try:
        await redis.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"

    all_ok = all(v == "ok" for v in checks.values())
    payload: dict[str, Any] = {
        "status": "ok" if all_ok else "degraded",
        "version": VERSION,
        "environment": settings.app_env,
        "uptime_seconds": int((datetime.now(tz=timezone.utc) - _started_at).total_seconds()),
        "checks": checks,
    }
    return JSONResponse(
        content=payload,
        status_code=200 if all_ok else 503,
    )


from app.routers import (  # noqa: E402  # noqa: E402
    auth,
    bookings,
    chat,
    discovery,
    google_calendar,
    matches,
    notifications,
    safety,
    users,
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(discovery.router)
app.include_router(matches.router)
app.include_router(chat.router)
app.include_router(bookings.router)
app.include_router(google_calendar.router)
app.include_router(google_calendar.booking_sync_router)
app.include_router(notifications.router)
app.include_router(notifications.internal_router)
app.include_router(safety.router)
