"""Matches endpoint tests using an in-memory SQLite async database."""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app

# Import all model modules so Base.metadata is fully populated. The chat
# model is needed because list_matches now joins messages to surface the
# last-message preview on each match row.
from app.models import chat, match, profile, user  # noqa: F401

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


# ---------------------------------------------------------------------------
# Last-message preview fields
# ---------------------------------------------------------------------------


async def test_match_with_no_messages_has_null_last_message_fields(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "match_lm_empty_a@example.com")
    token_b, uid_b = await _register(client, "match_lm_empty_b@example.com")

    await _mutual_like(client, token_a, uid_b, token_b, uid_a, sport="gym")

    r = await client.get("/matches", headers=_auth(token_a))
    assert r.status_code == 200
    m = r.json()["items"][0]
    # Brand-new match: every preview field must be explicitly null so the
    # mobile client can render its empty-state fallback ("Start the
    # conversation") rather than fabricating a message.
    assert m["last_message"] is None
    assert m["last_message_at"] is None
    assert m["last_message_sender_id"] is None


async def test_match_surfaces_latest_message_body_and_sender(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "match_lm_one_a@example.com")
    token_b, uid_b = await _register(client, "match_lm_one_b@example.com")

    await _mutual_like(client, token_a, uid_b, token_b, uid_a, sport="gym")

    matches_r = await client.get("/matches", headers=_auth(token_a))
    match_id = matches_r.json()["items"][0]["id"]

    # B sends a message → A's match row should preview it as a partner
    # message (sender_id == B's user id, not A's).
    await client.post(
        f"/matches/{match_id}/messages",
        json={"body": "Want to train this weekend?"},
        headers=_auth(token_b),
    )

    r = await client.get("/matches", headers=_auth(token_a))
    assert r.status_code == 200
    m = r.json()["items"][0]
    assert m["last_message"] == "Want to train this weekend?"
    assert m["last_message_at"] is not None
    assert m["last_message_sender_id"] == uid_b


async def test_match_preview_shows_only_the_most_recent_message(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "match_lm_latest_a@example.com")
    token_b, uid_b = await _register(client, "match_lm_latest_b@example.com")

    await _mutual_like(client, token_a, uid_b, token_b, uid_a, sport="tennis")

    matches_r = await client.get("/matches", headers=_auth(token_a))
    match_id = matches_r.json()["items"][0]["id"]

    # Send three messages in order; the latest is from A and must win.
    # SQLite's `CURRENT_TIMESTAMP` is second-precision, so the messages
    # need at least a one-second gap to be ordered deterministically by
    # `created_at DESC`. Two short sleeps cap the test at ~2.1s.
    await client.post(
        f"/matches/{match_id}/messages",
        json={"body": "Want to train this weekend?"},
        headers=_auth(token_b),
    )
    await asyncio.sleep(1.05)
    await client.post(
        f"/matches/{match_id}/messages",
        json={"body": "Saturday morning works for me."},
        headers=_auth(token_a),
    )
    await asyncio.sleep(1.05)
    await client.post(
        f"/matches/{match_id}/messages",
        json={"body": "Sounds good."},
        headers=_auth(token_a),
    )

    r = await client.get("/matches", headers=_auth(token_a))
    m = r.json()["items"][0]
    # The latest message is from A — sender_id should match A's user id.
    assert m["last_message"] == "Sounds good."
    assert m["last_message_sender_id"] == uid_a


async def test_match_preview_is_independent_per_match(client: AsyncClient) -> None:
    """Latest-message lookup must not bleed across matches."""
    token_a, uid_a = await _register(client, "match_lm_iso_a@example.com")
    token_b, uid_b = await _register(client, "match_lm_iso_b@example.com")
    token_c, uid_c = await _register(client, "match_lm_iso_c@example.com")

    await _mutual_like(client, token_a, uid_b, token_b, uid_a, sport="gym")
    await _mutual_like(client, token_a, uid_c, token_c, uid_a, sport="tennis")

    matches_r = await client.get("/matches", headers=_auth(token_a))
    items = matches_r.json()["items"]
    by_sport = {m["sport"]: m for m in items}
    gym_id = by_sport["gym"]["id"]
    tennis_id = by_sport["tennis"]["id"]

    # Only post on the gym match; tennis must remain previewless.
    await client.post(
        f"/matches/{gym_id}/messages",
        json={"body": "Let's plan a session."},
        headers=_auth(token_a),
    )

    r = await client.get("/matches", headers=_auth(token_a))
    items = r.json()["items"]
    by_id = {m["id"]: m for m in items}
    assert by_id[gym_id]["last_message"] == "Let's plan a session."
    assert by_id[tennis_id]["last_message"] is None
    assert by_id[tennis_id]["last_message_sender_id"] is None
