"""Auth endpoint tests using an in-memory SQLite async database."""

from __future__ import annotations

from datetime import datetime
from typing import AsyncGenerator
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app

# ---------------------------------------------------------------------------
# In-memory SQLite engine (shared across tests in this module)
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _TestSession() as session:
        yield session


from unittest.mock import AsyncMock


def _make_mock_redis() -> AsyncMock:
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.aclose = AsyncMock()
    return mock_redis


async def _override_get_redis() -> AsyncGenerator:
    yield _make_mock_redis()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REGISTER_PAYLOAD = {"email": "alice@example.com", "password": "supersecret"}


async def _register(client: AsyncClient, payload: dict | None = None) -> dict:
    p = payload or REGISTER_PAYLOAD
    r = await client.post("/auth/register", json=p)
    return r


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_register_creates_user_and_returns_token(client: AsyncClient) -> None:
    r = await _register(client)
    assert r.status_code == 201
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


async def test_register_duplicate_email_returns_400(client: AsyncClient) -> None:
    # First registration may already exist from previous test; ensure at least one exists.
    await client.post("/auth/register", json=REGISTER_PAYLOAD)
    r = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    assert r.status_code == 400


async def test_login_with_correct_credentials_returns_token(client: AsyncClient) -> None:
    # Re-register to ensure user exists (module-scoped DB keeps data).
    payload = {"email": "bob@example.com", "password": "password123"}
    await client.post("/auth/register", json=payload)

    r = await client.post("/auth/login", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


async def test_login_with_wrong_password_returns_401(client: AsyncClient) -> None:
    payload = {"email": "carol@example.com", "password": "rightpassword"}
    await client.post("/auth/register", json=payload)

    r = await client.post("/auth/login", json={"email": "carol@example.com", "password": "wrongpassword"})
    assert r.status_code == 401


async def test_get_me_with_valid_token_returns_user(client: AsyncClient) -> None:
    payload = {"email": "dave@example.com", "password": "password123"}
    reg = await client.post("/auth/register", json=payload)
    token = reg.json()["access_token"]

    r = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "dave@example.com"
    assert body["is_active"] is True
    assert "id" in body


async def test_get_me_with_no_token_returns_401(client: AsyncClient) -> None:
    r = await client.get("/auth/me")
    assert r.status_code == 403  # HTTPBearer returns 403 when no credentials supplied


async def test_get_me_with_invalid_token_returns_401(client: AsyncClient) -> None:
    r = await client.get("/auth/me", headers={"Authorization": "Bearer invalidtoken"})
    assert r.status_code == 401
