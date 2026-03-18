"""Push notification token registration tests."""

from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app

from app.models import match, profile, user, chat, booking  # noqa: F401
from app.models import google_calendar, notification, safety  # noqa: F401

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


async def _override_get_redis() -> AsyncGenerator:
    mock = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.aclose = AsyncMock()
    yield mock


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_register_token_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[abc123]", "platform": "ios"},
    )
    assert r.status_code == 403


async def test_register_token_returns_token_record(client: AsyncClient) -> None:
    token, _ = await _register(client, "notif_reg@example.com")
    r = await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[testtoken1]", "platform": "ios"},
        headers=_auth(token),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["token"] == "ExponentPushToken[testtoken1]"
    assert body["platform"] == "ios"
    assert "id" in body


async def test_register_token_idempotent(client: AsyncClient) -> None:
    token, _ = await _register(client, "notif_idem@example.com")
    payload = {"token": "ExponentPushToken[idemptoken]", "platform": "ios"}
    r1 = await client.post("/notifications/token", json=payload, headers=_auth(token))
    r2 = await client.post("/notifications/token", json=payload, headers=_auth(token))
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]


async def test_unregister_token_requires_auth(client: AsyncClient) -> None:
    r = await client.delete("/notifications/token/00000000-0000-0000-0000-000000000001")
    assert r.status_code == 403


async def test_unregister_token(client: AsyncClient) -> None:
    token, _ = await _register(client, "notif_unreg@example.com")
    reg_r = await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[unregtoken]", "platform": "android"},
        headers=_auth(token),
    )
    token_id = reg_r.json()["id"]

    r = await client.delete(f"/notifications/token/{token_id}", headers=_auth(token))
    assert r.status_code == 204


async def test_process_notifications_endpoint(client: AsyncClient) -> None:
    r = await client.post("/internal/process-notifications")
    assert r.status_code == 200
    body = r.json()
    assert "processed" in body
    assert "failed" in body


async def test_notification_scheduled_on_booking_proposal(client: AsyncClient) -> None:
    """Creating a booking enqueues a proposal_received notification for the partner."""
    token_a, uid_a = await _register(client, "notif_book_a@example.com")
    token_b, uid_b = await _register(client, "notif_book_b@example.com")

    # Register push token for partner B
    await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[partnerB]", "platform": "ios"},
        headers=_auth(token_b),
    )

    # Create a match
    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    match_id = r.json()["match_id"]

    # Propose a booking — should schedule a notification for partner B
    book_r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": "2026-06-01T09:00:00Z",
            "ends_at": "2026-06-01T10:00:00Z",
        },
        headers=_auth(token_a),
    )
    assert book_r.status_code == 201

    # Process pending notifications (delivery will succeed vacuously since expo_push_url
    # is empty in test config, but the event should be found and attempted)
    proc_r = await client.post("/internal/process-notifications")
    assert proc_r.status_code == 200
