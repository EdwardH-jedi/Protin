"""Service-layer tests for gcal_service.get_status `configured` flag.

Bypasses the auth/register flow (and the local bcrypt env mismatch) by
talking to the service directly with an in-memory SQLite session and a
fake user UUID.
"""

from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.services import google_calendar as gcal_service

_TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(_TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_status_reports_configured_false_when_client_id_unset(session) -> None:
    """When GOOGLE_CLIENT_ID is empty, /status must return configured=false so
    mobile can hide the Connect button and avoid /auth-url -> 503."""
    with patch("app.services.google_calendar.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(google_client_id="")
        result = await gcal_service.get_status(session, uuid4())
    assert result.connected is False
    assert result.configured is False


async def test_status_reports_configured_true_when_client_id_set(session) -> None:
    """When GOOGLE_CLIENT_ID is set, /status must surface configured=true so
    the mobile Connect button renders."""
    with patch("app.services.google_calendar.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(google_client_id="some-client-id.apps.googleusercontent.com")
        result = await gcal_service.get_status(session, uuid4())
    assert result.connected is False
    assert result.configured is True
