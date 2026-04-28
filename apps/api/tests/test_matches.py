"""Matches endpoint tests using an in-memory SQLite async database."""

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

# Import all model modules so Base.metadata is fully populated.
from app.models import match, profile, user  # noqa: F401

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]
    return token, user_id


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _mutual_like(
    client: AsyncClient,
    token_a: str,
    user_b_id: str,
    token_b: str,
    user_a_id: str,
    sport: str = "gym",
) -> None:
    await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "like", "sport": sport},
        headers=_auth(token_a),
    )
    await client.post(
        "/discovery/actions",
        json={"target_user_id": user_a_id, "action": "like", "sport": sport},
        headers=_auth(token_b),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_matches_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/matches")
    assert r.status_code in (401, 403)


async def test_matches_empty_for_new_user(client: AsyncClient) -> None:
    token, _ = await _register(client, "match_empty@example.com")
    r = await client.get("/matches", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


async def test_matches_returns_paginated_shape(client: AsyncClient) -> None:
    token, _ = await _register(client, "match_shape@example.com")
    r = await client.get("/matches", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "limit" in body
    assert "offset" in body


async def test_matches_appears_after_mutual_like(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "match_appear_a@example.com")
    token_b, uid_b = await _register(client, "match_appear_b@example.com")

    await _mutual_like(client, token_a, uid_b, token_b, uid_a, sport="gym")

    r = await client.get("/matches", headers=_auth(token_a))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    m = body["items"][0]
    assert m["sport"] == "gym"
    assert m["status"] == "active"
    assert "partner" in m
    assert "display_name" in m["partner"]


async def test_matches_visible_to_both_participants(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "match_vis_a@example.com")
    token_b, uid_b = await _register(client, "match_vis_b@example.com")

    await _mutual_like(client, token_a, uid_b, token_b, uid_a, sport="golf")

    r_a = await client.get("/matches", headers=_auth(token_a))
    r_b = await client.get("/matches", headers=_auth(token_b))

    # Both users see their match
    ids_a = {m["id"] for m in r_a.json()["items"]}
    ids_b = {m["id"] for m in r_b.json()["items"]}
    assert ids_a == ids_b


async def test_archive_match_changes_status(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "match_arch_a@example.com")
    token_b, uid_b = await _register(client, "match_arch_b@example.com")

    await _mutual_like(client, token_a, uid_b, token_b, uid_a, sport="gym")

    matches_r = await client.get("/matches", headers=_auth(token_a))
    match_id = matches_r.json()["items"][0]["id"]

    r = await client.patch(f"/matches/{match_id}", json={}, headers=_auth(token_a))
    assert r.status_code == 200
    assert r.json()["status"] == "archived"


async def test_archived_match_disappears_from_list(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "match_disapp_a@example.com")
    token_b, uid_b = await _register(client, "match_disapp_b@example.com")

    await _mutual_like(client, token_a, uid_b, token_b, uid_a, sport="gym")

    matches_r = await client.get("/matches", headers=_auth(token_a))
    match_id = matches_r.json()["items"][0]["id"]

    # Archive
    await client.patch(f"/matches/{match_id}", json={}, headers=_auth(token_a))

    # Should no longer appear
    r = await client.get("/matches", headers=_auth(token_a))
    ids = [m["id"] for m in r.json()["items"]]
    assert match_id not in ids


async def test_archive_by_non_participant_returns_404(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "match_nonpart_a@example.com")
    token_b, uid_b = await _register(client, "match_nonpart_b@example.com")
    token_c, _ = await _register(client, "match_nonpart_c@example.com")

    await _mutual_like(client, token_a, uid_b, token_b, uid_a, sport="gym")

    matches_r = await client.get("/matches", headers=_auth(token_a))
    match_id = matches_r.json()["items"][0]["id"]

    # C is not a participant
    r = await client.patch(f"/matches/{match_id}", json={}, headers=_auth(token_c))
    assert r.status_code == 404


async def test_archive_nonexistent_match_returns_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "match_noexist@example.com")
    r = await client.patch("/matches/00000000-0000-0000-0000-000000000001", json={}, headers=_auth(token))
    assert r.status_code == 404
