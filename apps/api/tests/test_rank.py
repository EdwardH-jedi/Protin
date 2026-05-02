"""Sports Reputation (rank + honor) tests using in-memory SQLite."""

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
from app.services.rank import (
    HONOR_BASELINE,
    HONOR_DELTA_LATE_CANCELLATION,
    HONOR_DELTA_NO_SHOW_AGAINST_USER,
    HONOR_DELTA_NO_SHOW_MARKED_BY_USER,
    HONOR_DELTA_SESSION_COMPLETED,
    RANK_DELTA_SESSION_COMPLETED,
    compute_tier,
)

# Import every model so Base.metadata.create_all builds the full schema.
from app.models import (  # noqa: F401
    booking,
    chat,
    match,
    profile,
    rank,
    safety,
    user,
    venue,
)

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
# Helpers — copied from test_bookings.py to avoid cross-test fixture leakage
# ---------------------------------------------------------------------------


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _matched_pair(
    client: AsyncClient, email_a: str, email_b: str, sport: str = "tennis"
) -> tuple[str, str, str, str, str]:
    """Returns (token_a, uid_a, token_b, uid_b, match_id)."""
    token_a, uid_a = await _register(client, email_a)
    token_b, uid_b = await _register(client, email_b)
    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": sport},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": sport},
        headers=_auth(token_b),
    )
    return token_a, uid_a, token_b, uid_b, r.json()["match_id"]


async def _create_booking(client: AsyncClient, token: str, match_id: str, sport: str = "tennis") -> str:
    r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": sport,
            "starts_at": "2030-04-01T09:00:00Z",
            "ends_at": "2030-04-01T10:00:00Z",
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _confirm(client: AsyncClient, token: str, booking_id: str) -> None:
    r = await client.post(f"/bookings/{booking_id}/confirm", headers=_auth(token))
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Pure-function tests
# ---------------------------------------------------------------------------


def test_compute_tier_bands() -> None:
    assert compute_tier(0) == "Rookie"
    assert compute_tier(9) == "Rookie"
    assert compute_tier(10) == "Bronze"
    assert compute_tier(49) == "Bronze"
    assert compute_tier(50) == "Silver"
    assert compute_tier(149) == "Silver"
    assert compute_tier(150) == "Gold"
    assert compute_tier(399) == "Gold"
    assert compute_tier(400) == "Platinum"
    assert compute_tier(999) == "Platinum"
    assert compute_tier(1000) == "Diamond"
    assert compute_tier(99999) == "Diamond"


# ---------------------------------------------------------------------------
# Endpoint tests — auth + empty state
# ---------------------------------------------------------------------------


async def test_self_summary_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/users/me/rank-summary")
    assert r.status_code in (401, 403)


async def test_self_summary_empty_for_new_user(client: AsyncClient) -> None:
    """Brand-new user: honor at baseline, no sport rank rows."""
    token, _ = await _register(client, "rank_empty@example.com")
    r = await client.get("/users/me/rank-summary", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["honor"] == HONOR_BASELINE
    assert body["sports"] == []


async def test_public_summary_unknown_user_returns_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "rank_unknown@example.com")
    r = await client.get(
        "/users/00000000-0000-0000-0000-000000000999/rank-summary",
        headers=_auth(token),
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Endpoint tests — booking-driven events
# ---------------------------------------------------------------------------


async def test_completed_booking_creates_positive_honor_event(client: AsyncClient) -> None:
    token_a, uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_done_a@example.com", "rank_done_b@example.com", sport="tennis"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="tennis")
    await _confirm(client, token_b, booking_id)
    r = await client.post(f"/bookings/{booking_id}/complete", headers=_auth(token_a))
    assert r.status_code == 200, r.text

    # Both participants get +HONOR_DELTA_SESSION_COMPLETED honor and a
    # tennis rank row with one completed session.
    me = await client.get("/users/me/rank-summary", headers=_auth(token_a))
    body = me.json()
    assert body["honor"] == HONOR_BASELINE + HONOR_DELTA_SESSION_COMPLETED
    assert len(body["sports"]) == 1
    s = body["sports"][0]
    assert s["sport"] == "tennis"
    assert s["rank_points"] == RANK_DELTA_SESSION_COMPLETED
    assert s["sessions_completed"] == 1
    assert s["tier"] == "Rookie"  # below the 10-point Bronze threshold

    # The other participant sees the same on their own summary.
    me_b = await client.get("/users/me/rank-summary", headers=_auth(token_b))
    body_b = me_b.json()
    assert body_b["honor"] == HONOR_BASELINE + HONOR_DELTA_SESSION_COMPLETED
    assert len(body_b["sports"]) == 1
    assert body_b["sports"][0]["sessions_completed"] == 1


async def test_no_show_creates_negative_honor_for_other_and_actor(client: AsyncClient) -> None:
    """
    The user who *calls* no_show takes a smaller penalty (anti-abuse). The
    other party takes the larger penalty. Both deltas must land — this is
    the V2.0 mitigation for the one-sided no_show transition.
    """
    token_a, _uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_ns_a@example.com", "rank_ns_b@example.com", sport="tennis"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="tennis")
    await _confirm(client, token_b, booking_id)

    # B marks A as no-show. A is the "other" party (larger penalty); B is
    # the actor (smaller penalty).
    r = await client.post(f"/bookings/{booking_id}/no-show", headers=_auth(token_b))
    assert r.status_code == 200, r.text

    a_summary = (await client.get("/users/me/rank-summary", headers=_auth(token_a))).json()
    b_summary = (await client.get("/users/me/rank-summary", headers=_auth(token_b))).json()
    assert a_summary["honor"] == HONOR_BASELINE + HONOR_DELTA_NO_SHOW_AGAINST_USER
    assert b_summary["honor"] == HONOR_BASELINE + HONOR_DELTA_NO_SHOW_MARKED_BY_USER
    # No rank change — play didn't happen.
    assert a_summary["sports"] == []
    assert b_summary["sports"] == []


async def test_late_cancellation_dings_actor_only(client: AsyncClient) -> None:
    """Cancelling a confirmed booking costs the actor 1 honor; the other party is unaffected."""
    token_a, _uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_cancel_a@example.com", "rank_cancel_b@example.com", sport="golf"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="golf")
    await _confirm(client, token_b, booking_id)

    r = await client.post(f"/bookings/{booking_id}/cancel", headers=_auth(token_a))
    assert r.status_code == 200, r.text

    a_summary = (await client.get("/users/me/rank-summary", headers=_auth(token_a))).json()
    b_summary = (await client.get("/users/me/rank-summary", headers=_auth(token_b))).json()
    assert a_summary["honor"] == HONOR_BASELINE + HONOR_DELTA_LATE_CANCELLATION
    assert b_summary["honor"] == HONOR_BASELINE


async def test_cancelling_a_proposed_booking_has_no_honor_cost(client: AsyncClient) -> None:
    """Cancelling before partner confirms = no commitment broken = no penalty."""
    token_a, _uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_pcancel_a@example.com", "rank_pcancel_b@example.com", sport="running"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="running")
    # No confirmation — cancel from "proposed" directly.
    r = await client.post(f"/bookings/{booking_id}/cancel", headers=_auth(token_a))
    assert r.status_code == 200, r.text

    summary = (await client.get("/users/me/rank-summary", headers=_auth(token_a))).json()
    assert summary["honor"] == HONOR_BASELINE
    assert summary["sports"] == []


async def test_sport_specific_rank_summary_groups_by_sport(client: AsyncClient) -> None:
    """A user playing two sports must get two distinct rank rows."""
    # Pair 1: tennis
    t_a, uid_a, t_b, _uid_b, match_tennis = await _matched_pair(
        client, "rank_multi_a@example.com", "rank_multi_b@example.com", sport="tennis"
    )
    book_tennis = await _create_booking(client, t_a, match_tennis, sport="tennis")
    await _confirm(client, t_b, book_tennis)
    await client.post(f"/bookings/{book_tennis}/complete", headers=_auth(t_a))

    # Pair 2: same A, different partner C, sport=golf
    t_c, _uid_c = await _register(client, "rank_multi_c@example.com")
    await client.post(
        "/discovery/actions",
        json={"target_user_id": _uid_c, "action": "like", "sport": "golf"},
        headers=_auth(t_a),
    )
    match_golf = (
        await client.post(
            "/discovery/actions",
            json={"target_user_id": uid_a, "action": "like", "sport": "golf"},
            headers=_auth(t_c),
        )
    ).json()["match_id"]
    book_golf = await _create_booking(client, t_a, match_golf, sport="golf")
    await _confirm(client, t_c, book_golf)
    await client.post(f"/bookings/{book_golf}/complete", headers=_auth(t_a))

    summary = (await client.get("/users/me/rank-summary", headers=_auth(t_a))).json()
    sport_keys = sorted(s["sport"] for s in summary["sports"])
    assert sport_keys == ["golf", "tennis"]
    for s in summary["sports"]:
        assert s["sessions_completed"] == 1
        assert s["rank_points"] == RANK_DELTA_SESSION_COMPLETED
    # +1 honor per session, two sessions → +2 from baseline.
    assert summary["honor"] == HONOR_BASELINE + 2 * HONOR_DELTA_SESSION_COMPLETED


async def test_honor_floor_clamps_at_zero(client: AsyncClient) -> None:
    """Many large negative events must clamp to HONOR_FLOOR (0), not go negative."""
    from app.models.rank import HonorEvent
    from sqlalchemy import select as _select

    token, uid = await _register(client, "rank_floor@example.com")

    # Hand-seed 50 large negative events (~ -250 raw) directly. The summary
    # service must clamp the response at 0 regardless of the raw sum.
    async with _TestSession() as db:
        from uuid import UUID

        user_uuid = UUID(uid)
        for _ in range(50):
            db.add(
                HonorEvent(
                    user_id=user_uuid,
                    delta=-5,
                    reason="no_show_against_user",
                    booking_id=None,
                )
            )
        await db.commit()
        # Sanity-check: rows landed.
        count = (
            await db.execute(_select(HonorEvent).where(HonorEvent.user_id == user_uuid))
        ).scalars().all()
        assert len(count) == 50

    r = await client.get("/users/me/rank-summary", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["honor"] == 0


async def test_public_summary_returns_only_safe_fields(client: AsyncClient) -> None:
    """Public-safe summary must never expose negative event details or moderation data."""
    token_a, uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_pub_a@example.com", "rank_pub_b@example.com", sport="tennis"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="tennis")
    await _confirm(client, token_b, booking_id)
    await client.post(f"/bookings/{booking_id}/complete", headers=_auth(token_a))

    # B reads A's public summary.
    r = await client.get(f"/users/{uid_a}/rank-summary", headers=_auth(token_b))
    assert r.status_code == 200
    body = r.json()
    # Schema is the same as self — only honor + sports.
    assert set(body.keys()) == {"honor", "sports"}
    # Sports rows expose only the four publishable fields.
    if body["sports"]:
        for s in body["sports"]:
            assert set(s.keys()) == {"sport", "rank_points", "tier", "sessions_completed"}
    # No event log, no breakdown of negative reasons.
    assert "events" not in body
    assert "no_show_count" not in body
    assert "cancellations" not in body
