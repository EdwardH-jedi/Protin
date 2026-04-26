"""Tests for the Step 1 onboarding upsert path.

These tests prove that ``display_name``, ``birth_year``, and ``suburb`` —
the fields collected on Step 1 of mobile onboarding — actually round-trip
through ``PUT /users/me/profile`` and ``GET /users/me/profile``.

The displayName-not-saving release blocker was caused by a stale static
``birth_year`` upper bound (``le=2005``) on the profile schemas. With
``CURRENT_YEAR >= 2024`` the mobile picker mints years up to
``CURRENT_YEAR - 18`` (e.g. 2008), so a 422 fired on the entire upsert and
``display_name`` never reached the database. The schema now validates
``birth_year`` against ``date.today().year - {18, 90}`` dynamically; these
tests pin both the success path at the boundary and the rejection just
outside it.

Auth is bypassed via the same dependency-override pattern used in
``test_profile_photos.py`` so this suite does not depend on ``bcrypt``.
"""

from __future__ import annotations

from datetime import date
from typing import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.routers.auth import get_current_user

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables() -> AsyncGenerator[None, None]:
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
async def profile_client() -> AsyncGenerator[tuple[AsyncClient, User], None]:
    import uuid as _uuid

    email = f"persist_{_uuid.uuid4().hex[:8]}@example.com"
    async with _TestSession() as session:
        user = User(email=email, hashed_password="x")
        session.add(user)
        await session.commit()
        await session.refresh(user)

    async def _override_current_user() -> User:
        return user

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis
    app.dependency_overrides[get_current_user] = _override_current_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac, user

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Display name round-trip
# ---------------------------------------------------------------------------


async def test_put_profile_persists_display_name(profile_client) -> None:
    client, _ = profile_client
    r = await client.put(
        "/users/me/profile",
        json={"display_name": "Jordan Lee", "suburb": "Newtown"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["display_name"] == "Jordan Lee"


async def test_get_profile_returns_persisted_display_name(profile_client) -> None:
    client, _ = profile_client
    await client.put(
        "/users/me/profile",
        json={
            "display_name": "Jordan Lee",
            "birth_year": date.today().year - 25,
            "suburb": "Newtown",
        },
    )
    r = await client.get("/users/me/profile")
    assert r.status_code == 200
    body = r.json()
    assert body["display_name"] == "Jordan Lee"
    assert body["birth_year"] == date.today().year - 25
    assert body["suburb"] == "Newtown"


async def test_put_profile_persists_step1_payload_at_min_age_boundary(profile_client) -> None:
    """Regression: Step 1 mints years up to ``CURRENT_YEAR - 18``. The previous
    static ``le=2005`` rejected this and dropped display_name with the rest of
    the payload."""
    client, _ = profile_client
    boundary_year = date.today().year - 18
    r = await client.put(
        "/users/me/profile",
        json={
            "display_name": "Min Age User",
            "birth_year": boundary_year,
            "suburb": "Newtown",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["display_name"] == "Min Age User"
    assert body["birth_year"] == boundary_year


async def test_put_profile_persists_step1_payload_at_max_age_boundary(profile_client) -> None:
    client, _ = profile_client
    boundary_year = date.today().year - 90
    r = await client.put(
        "/users/me/profile",
        json={
            "display_name": "Max Age User",
            "birth_year": boundary_year,
            "suburb": "Bondi",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["display_name"] == "Max Age User"
    assert body["birth_year"] == boundary_year


async def test_put_profile_rejects_birth_year_under_min_age(profile_client) -> None:
    client, _ = profile_client
    too_recent = date.today().year - 17
    r = await client.put(
        "/users/me/profile",
        json={
            "display_name": "Too Young",
            "birth_year": too_recent,
            "suburb": "Newtown",
        },
    )
    assert r.status_code == 422


async def test_put_profile_rejects_birth_year_over_max_age(profile_client) -> None:
    client, _ = profile_client
    too_old = date.today().year - 91
    r = await client.put(
        "/users/me/profile",
        json={
            "display_name": "Too Old",
            "birth_year": too_old,
            "suburb": "Newtown",
        },
    )
    assert r.status_code == 422


async def test_put_profile_update_preserves_display_name_when_only_bio_sent(profile_client) -> None:
    """Step 2 sends `{displayName, birthYear, suburb, bio}` so this should
    behave exactly like the real flow: display_name remains intact after the
    second upsert."""
    client, _ = profile_client
    boundary_year = date.today().year - 30

    create = await client.put(
        "/users/me/profile",
        json={
            "display_name": "Jordan Lee",
            "birth_year": boundary_year,
            "suburb": "Newtown",
        },
    )
    assert create.status_code == 200

    update = await client.put(
        "/users/me/profile",
        json={
            "display_name": "Jordan Lee",
            "birth_year": boundary_year,
            "suburb": "Newtown",
            "bio": "Early-morning runner.",
        },
    )
    assert update.status_code == 200

    fetched = await client.get("/users/me/profile")
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["display_name"] == "Jordan Lee"
    assert body["birth_year"] == boundary_year
    assert body["bio"] == "Early-morning runner."
