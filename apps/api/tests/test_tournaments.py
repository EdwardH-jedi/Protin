"""Tournament list / detail / join / leave tests using in-memory SQLite."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models import (  # noqa: F401  — populate Base.metadata
    booking,
    chat,
    match,
    profile,
    rank,
    safety,
    tournament,
    user,
    venue,
)
from app.models.tournament import Tournament

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables():
    # Force the feature flag on for the entire test module. The default is
    # off, which would make every endpoint 404; that's tested separately.
    settings = get_settings()
    settings.tournaments_enabled = True
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    settings.tournaments_enabled = False


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
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _seed_tournament(
    *,
    organizer_id: str,
    title: str = "Sydney Open",
    sport: str = "tennis",
    capacity: int = 4,
    status: str = "open",
    starts_at: datetime | None = None,
    description: str | None = "Friendly tournament",
    area: str | None = "Bondi",
) -> str:
    if starts_at is None:
        starts_at = datetime.now(tz=timezone.utc) + timedelta(days=14)
    async with _TestSession() as db:
        t = Tournament(
            id=uuid4(),
            organizer_id=UUID(organizer_id),
            title=title,
            sport=sport,
            description=description,
            area=area,
            starts_at=starts_at,
            capacity=capacity,
            status=status,
        )
        db.add(t)
        await db.commit()
        return str(t.id)


async def _wipe_tournaments() -> None:
    """Module-scoped DB; clean between tests so participant counts don't bleed."""
    from sqlalchemy import delete

    from app.models.tournament import Tournament, TournamentParticipant

    async with _TestSession() as db:
        await db.execute(delete(TournamentParticipant))
        await db.execute(delete(Tournament))
        await db.commit()


# ---------------------------------------------------------------------------
# Auth + flag
# ---------------------------------------------------------------------------


async def test_list_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/tournaments")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Default-policy unit tests (pin the model_post_init behavior)
# ---------------------------------------------------------------------------


def test_tournaments_enabled_auto_defaults_true_in_local_dev() -> None:
    """APP_ENV=local without an explicit env var should auto-enable.

    Pins the V2 dev convenience: a fresh ``Settings()`` in local dev
    yields a working /tournaments surface without requiring the
    developer to also set TOURNAMENTS_ENABLED=true.
    """
    from app.core.config import Settings

    assert Settings(app_env="local").tournaments_enabled is True


def test_tournaments_enabled_default_false_in_staging_and_production() -> None:
    """Non-local environments stay OFF unless explicitly enabled.

    Pins the production-safety side of the policy: even with the file's
    default of False, this test would catch a regression where the
    auto-flip leaks into staging/production.
    """
    from app.core.config import Settings

    assert Settings(app_env="staging").tournaments_enabled is False
    assert Settings(app_env="production").tournaments_enabled is False


def test_tournaments_enabled_explicit_value_wins_in_local() -> None:
    """An explicit TOURNAMENTS_ENABLED=false beats the local-dev auto-flip.

    Lets a developer exercise the disabled-flag UI path without leaving
    APP_ENV=local. Without this, ``model_fields_set`` would not include
    ``tournaments_enabled`` and the post-init would silently override.
    """
    from app.core.config import Settings

    s = Settings(app_env="local", tournaments_enabled=False)
    assert s.tournaments_enabled is False


async def test_routes_404_when_feature_flag_disabled(client: AsyncClient) -> None:
    """Fail-open: client gets 404 (and hides the entry card) when the flag is off."""
    settings = get_settings()
    token, _ = await _register(client, "tour_flag@example.com")
    settings.tournaments_enabled = False
    try:
        r = await client.get("/tournaments", headers=_auth(token))
        assert r.status_code == 404
    finally:
        settings.tournaments_enabled = True


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


async def test_list_returns_open_and_full_by_default(client: AsyncClient) -> None:
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_list@example.com")
    open_id = await _seed_tournament(organizer_id=uid, title="Open A", status="open")
    full_id = await _seed_tournament(organizer_id=uid, title="Full B", status="full")
    cancelled_id = await _seed_tournament(organizer_id=uid, title="Cancelled C", status="cancelled")
    draft_id = await _seed_tournament(organizer_id=uid, title="Draft D", status="draft")

    r = await client.get("/tournaments", headers=_auth(token))
    assert r.status_code == 200
    items = r.json()["items"]
    ids = {i["id"] for i in items}
    assert open_id in ids
    assert full_id in ids
    # Cancelled is hidden by default; drafts always hidden from list.
    assert cancelled_id not in ids
    assert draft_id not in ids
    # has_joined defaults to false for tournaments the user hasn't joined.
    for item in items:
        assert item["has_joined"] is False


async def test_list_with_mine_filter_returns_only_joined(client: AsyncClient) -> None:
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_mine@example.com")
    joined_id = await _seed_tournament(organizer_id=uid, title="My Tournament")
    _other_id = await _seed_tournament(organizer_id=uid, title="Not Mine")

    # Join the first one.
    r = await client.post(f"/tournaments/{joined_id}/join", headers=_auth(token))
    assert r.status_code == 200, r.text

    r = await client.get("/tournaments?mine=true", headers=_auth(token))
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == joined_id
    assert items[0]["has_joined"] is True


async def test_list_filters_by_sport(client: AsyncClient) -> None:
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_sport@example.com")
    tennis_id = await _seed_tournament(organizer_id=uid, title="T A", sport="tennis")
    _golf_id = await _seed_tournament(organizer_id=uid, title="G B", sport="golf")

    r = await client.get("/tournaments?sport=tennis", headers=_auth(token))
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == tennis_id


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


async def test_detail_returns_participant_list(client: AsyncClient) -> None:
    await _wipe_tournaments()
    token_a, uid_a = await _register(client, "tour_detail_a@example.com")
    token_b, _uid_b = await _register(client, "tour_detail_b@example.com")
    tournament_id = await _seed_tournament(organizer_id=uid_a)

    await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(token_a))
    await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(token_b))

    r = await client.get(f"/tournaments/{tournament_id}", headers=_auth(token_a))
    assert r.status_code == 200
    body = r.json()
    assert body["participant_count"] == 2
    assert body["spots_left"] == 2  # capacity 4 - 2 joined
    assert body["has_joined"] is True
    assert len(body["participants"]) == 2


async def test_detail_404_for_draft_tournament(client: AsyncClient) -> None:
    """Draft tournaments are not yet published — must look like 404 to clients."""
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_draft@example.com")
    draft_id = await _seed_tournament(organizer_id=uid, status="draft")

    r = await client.get(f"/tournaments/{draft_id}", headers=_auth(token))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Join
# ---------------------------------------------------------------------------


async def test_join_open_tournament_increments_participant_count(client: AsyncClient) -> None:
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_join@example.com")
    tournament_id = await _seed_tournament(organizer_id=uid, capacity=4)

    r = await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["participant_count"] == 1
    assert body["has_joined"] is True
    assert body["status"] == "open"  # capacity 4, only 1 joined


async def test_cannot_join_twice_returns_409(client: AsyncClient) -> None:
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_double@example.com")
    tournament_id = await _seed_tournament(organizer_id=uid)

    r1 = await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(token))
    assert r1.status_code == 200
    r2 = await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(token))
    assert r2.status_code == 409


async def test_capacity_enforced_and_status_flips_to_full(client: AsyncClient) -> None:
    await _wipe_tournaments()
    a_tok, a_uid = await _register(client, "tour_cap_a@example.com")
    b_tok, _b_uid = await _register(client, "tour_cap_b@example.com")
    c_tok, _c_uid = await _register(client, "tour_cap_c@example.com")

    tournament_id = await _seed_tournament(organizer_id=a_uid, capacity=2)

    # Two joins fill the tournament.
    assert (await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(a_tok))).status_code == 200
    last = await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(b_tok))
    assert last.status_code == 200
    assert last.json()["status"] == "full"

    # Third user tries to join → 422.
    third = await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(c_tok))
    assert third.status_code == 422
    assert "not accepting joins" in third.json()["detail"].lower()


async def test_cannot_join_cancelled_tournament(client: AsyncClient) -> None:
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_cxl@example.com")
    tournament_id = await _seed_tournament(organizer_id=uid, status="cancelled")

    r = await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(token))
    assert r.status_code == 422


async def test_cannot_join_closed_tournament(client: AsyncClient) -> None:
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_closed@example.com")
    tournament_id = await _seed_tournament(organizer_id=uid, status="closed")

    r = await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(token))
    assert r.status_code == 422


async def test_cannot_join_draft_tournament_returns_404(client: AsyncClient) -> None:
    """Drafts must look like 404 even on the join endpoint — same privacy rule as detail."""
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_draft_join@example.com")
    tournament_id = await _seed_tournament(organizer_id=uid, status="draft")

    r = await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(token))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Leave
# ---------------------------------------------------------------------------


async def test_leave_after_join_decrements_count(client: AsyncClient) -> None:
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_leave@example.com")
    tournament_id = await _seed_tournament(organizer_id=uid)

    await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(token))
    r = await client.post(f"/tournaments/{tournament_id}/leave", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["participant_count"] == 0
    assert body["has_joined"] is False


async def test_full_to_open_round_trip(client: AsyncClient) -> None:
    """
    Two-cycle pin: join to capacity → status flips to 'full'; one user
    leaves → flips back to 'open'; another user can re-join → 'full' again.
    Catches refactors that get the delete-then-recompute order backwards.
    """
    await _wipe_tournaments()
    a_tok, a_uid = await _register(client, "tour_cycle_a@example.com")
    b_tok, _b_uid = await _register(client, "tour_cycle_b@example.com")
    c_tok, _c_uid = await _register(client, "tour_cycle_c@example.com")

    tournament_id = await _seed_tournament(organizer_id=a_uid, capacity=2)

    # Fill to capacity → 'full'.
    await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(a_tok))
    full = await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(b_tok))
    assert full.json()["status"] == "full"

    # B leaves → should flip back to 'open'.
    left = await client.post(f"/tournaments/{tournament_id}/leave", headers=_auth(b_tok))
    assert left.status_code == 200
    assert left.json()["status"] == "open"
    assert left.json()["participant_count"] == 1

    # C joins → should flip back to 'full'.
    rejoined = await client.post(f"/tournaments/{tournament_id}/join", headers=_auth(c_tok))
    assert rejoined.status_code == 200
    assert rejoined.json()["status"] == "full"


async def test_cannot_leave_when_not_joined_returns_404(client: AsyncClient) -> None:
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_noleave@example.com")
    tournament_id = await _seed_tournament(organizer_id=uid)

    r = await client.post(f"/tournaments/{tournament_id}/leave", headers=_auth(token))
    assert r.status_code == 404


async def test_cannot_leave_completed_or_cancelled(client: AsyncClient) -> None:
    """Terminal-status tournaments lock the leave endpoint regardless of join status."""
    await _wipe_tournaments()
    token, uid = await _register(client, "tour_term@example.com")
    completed_id = await _seed_tournament(organizer_id=uid, status="completed")
    cancelled_id = await _seed_tournament(organizer_id=uid, status="cancelled")

    r1 = await client.post(f"/tournaments/{completed_id}/leave", headers=_auth(token))
    assert r1.status_code == 422
    r2 = await client.post(f"/tournaments/{cancelled_id}/leave", headers=_auth(token))
    assert r2.status_code == 422


async def test_unknown_tournament_returns_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "tour_unknown@example.com")
    r = await client.get(
        "/tournaments/00000000-0000-0000-0000-000000000999",
        headers=_auth(token),
    )
    assert r.status_code == 404
