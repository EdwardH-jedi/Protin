"""Discovery endpoint tests using an in-memory SQLite async database."""

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


async def _register(client: AsyncClient, email: str) -> str:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 201
    return r.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_discovery_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/discovery?sport=gym")
    assert r.status_code == 403


async def test_discovery_returns_paginated_shape(client: AsyncClient) -> None:
    token = await _register(client, "disc_shape@example.com")
    r = await client.get("/discovery?sport=gym", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "limit" in body
    assert "offset" in body
    assert isinstance(body["items"], list)


async def test_discovery_excludes_current_user(client: AsyncClient) -> None:
    token = await _register(client, "disc_self@example.com")
    # Give self a profile + sport profile so they could theoretically appear
    await client.put(
        "/users/me/profile",
        json={"display_name": "Self User"},
        headers=_auth(token),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "beginner"},
        headers=_auth(token),
    )
    me = await client.get("/auth/me", headers=_auth(token))
    self_id = me.json()["id"]

    r = await client.get("/discovery?sport=gym", headers=_auth(token))
    assert r.status_code == 200
    user_ids = [item["user_id"] for item in r.json()["items"]]
    assert self_id not in user_ids


async def test_discovery_returns_users_with_matching_sport_profile(
    client: AsyncClient,
) -> None:
    token_viewer = await _register(client, "disc_viewer@example.com")
    token_partner = await _register(client, "disc_partner@example.com")

    # Partner sets up a gym profile
    await client.put(
        "/users/me/profile",
        json={"display_name": "Gym Partner", "suburb": "Bondi"},
        headers=_auth(token_partner),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "intermediate"},
        headers=_auth(token_partner),
    )
    me_partner = await client.get("/auth/me", headers=_auth(token_partner))
    partner_id = me_partner.json()["id"]

    r = await client.get("/discovery?sport=gym", headers=_auth(token_viewer))
    assert r.status_code == 200
    user_ids = [item["user_id"] for item in r.json()["items"]]
    assert partner_id in user_ids


async def test_record_action_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/discovery/actions",
        json={
            "target_user_id": "00000000-0000-0000-0000-000000000001",
            "action": "like",
            "sport": "gym",
        },
    )
    assert r.status_code == 403


async def test_record_action_returns_shape(client: AsyncClient) -> None:
    token_a = await _register(client, "disc_act_a@example.com")
    token_b = await _register(client, "disc_act_b@example.com")
    me_b = await client.get("/auth/me", headers=_auth(token_b))
    user_b_id = me_b.json()["id"]

    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["action"] == "like"
    assert body["match_created"] is False
    assert body["match_id"] is None


async def test_one_sided_like_does_not_create_match(client: AsyncClient) -> None:
    token_a = await _register(client, "disc_one_a@example.com")
    token_b = await _register(client, "disc_one_b@example.com")
    me_b = await client.get("/auth/me", headers=_auth(token_b))
    user_b_id = me_b.json()["id"]

    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    assert r.json()["match_created"] is False
    assert r.json()["match_id"] is None


async def test_mutual_like_creates_match(client: AsyncClient) -> None:
    token_a = await _register(client, "disc_mutual_a@example.com")
    token_b = await _register(client, "disc_mutual_b@example.com")

    me_a = await client.get("/auth/me", headers=_auth(token_a))
    me_b = await client.get("/auth/me", headers=_auth(token_b))
    user_a_id = me_a.json()["id"]
    user_b_id = me_b.json()["id"]

    # A likes B — no match yet
    r1 = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    assert r1.json()["match_created"] is False

    # B likes A — mutual → match created
    r2 = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_a_id, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    assert r2.status_code == 200
    assert r2.json()["match_created"] is True
    assert r2.json()["match_id"] is not None


async def test_pass_action_does_not_create_match(client: AsyncClient) -> None:
    token_a = await _register(client, "disc_pass_a@example.com")
    token_b = await _register(client, "disc_pass_b@example.com")

    me_a = await client.get("/auth/me", headers=_auth(token_a))
    me_b = await client.get("/auth/me", headers=_auth(token_b))
    user_a_id = me_a.json()["id"]
    user_b_id = me_b.json()["id"]

    # A passes B
    await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "pass", "sport": "golf"},
        headers=_auth(token_a),
    )
    # B likes A — should not create match because A passed
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_a_id, "action": "like", "sport": "golf"},
        headers=_auth(token_b),
    )
    assert r.json()["match_created"] is False


async def test_acted_on_users_excluded_from_feed(client: AsyncClient) -> None:
    token_a = await _register(client, "disc_excl_a@example.com")
    token_b = await _register(client, "disc_excl_b@example.com")

    me_b = await client.get("/auth/me", headers=_auth(token_b))
    user_b_id = me_b.json()["id"]

    # Partner B sets up profile so they appear in feed
    await client.put(
        "/users/me/profile",
        json={"display_name": "Excluded Partner"},
        headers=_auth(token_b),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "beginner"},
        headers=_auth(token_b),
    )

    # A passes B
    await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "pass", "sport": "gym"},
        headers=_auth(token_a),
    )

    # B should no longer appear in A's feed
    r = await client.get("/discovery?sport=gym", headers=_auth(token_a))
    user_ids = [item["user_id"] for item in r.json()["items"]]
    assert user_b_id not in user_ids
