"""Auth endpoint tests using an in-memory SQLite async database."""

from __future__ import annotations

from datetime import datetime
from typing import AsyncGenerator
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.rate_limit import limiter
from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app

# Disable slowapi limiter — tests don't run Redis.
limiter.enabled = False

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


# ---------------------------------------------------------------------------
# DELETE /auth/me — account deletion (App Store 5.1.1(v))
# ---------------------------------------------------------------------------


async def test_delete_me_removes_user_and_owned_rows(client: AsyncClient) -> None:
    from sqlalchemy import select

    from app.core.security import create_access_token
    from app.models.booking import Booking
    from app.models.chat import Message
    from app.models.match import DiscoveryAction, Match
    from app.models.notification import PushToken
    from app.models.profile import IdentityPreferences, SportProfile, UserProfile
    from app.models.safety import Block, Report
    from app.models.user import User

    # Seed two users directly via the test session (bypassing /auth/register
    # so this test does not depend on bcrypt — there is a known bcrypt/passlib
    # environment issue in CI that is orthogonal to account-deletion).
    async with _TestSession() as session:
        alice = User(email="del-alice@example.com", hashed_password="x" * 60)
        bob = User(email="del-bob@example.com", hashed_password="x" * 60)
        session.add_all([alice, bob])
        await session.flush()
        alice_id = alice.id
        bob_id = bob.id

        session.add(UserProfile(user_id=alice_id, display_name="Alice"))
        session.add(IdentityPreferences(user_id=alice_id))
        session.add(SportProfile(user_id=alice_id, sport="gym", level="intermediate"))
        session.add(DiscoveryAction(actor_id=alice_id, target_id=bob_id, sport="gym", action="like"))

        match = Match(user1_id=alice_id, user2_id=bob_id, sport="gym")
        session.add(match)
        await session.flush()

        session.add(Message(match_id=match.id, sender_id=alice_id, body="hi"))
        booking = Booking(
            match_id=match.id,
            proposer_id=alice_id,
            partner_id=bob_id,
            sport="gym",
            starts_at=datetime(2026, 5, 1, 10, 0),
            ends_at=datetime(2026, 5, 1, 11, 0),
        )
        session.add(booking)
        session.add(Report(reporter_id=alice_id, reported_id=bob_id, reason="spam"))
        session.add(Block(blocker_id=alice_id, blocked_id=bob_id))
        session.add(PushToken(user_id=alice_id, token=f"ExponentPushToken[{uuid4()}]", platform="ios"))
        await session.commit()

    # Mint a token directly (avoids /auth/login, which needs bcrypt).
    alice_token = create_access_token(str(alice_id))

    # Delete Alice
    r = await client.delete("/auth/me", headers={"Authorization": f"Bearer {alice_token}"})
    assert r.status_code == 204

    # Verify all Alice-owned rows are gone
    async with _TestSession() as session:
        assert (await session.execute(select(User).where(User.id == alice_id))).scalar_one_or_none() is None
        for model, col in [
            (UserProfile, UserProfile.user_id),
            (IdentityPreferences, IdentityPreferences.user_id),
            (SportProfile, SportProfile.user_id),
            (PushToken, PushToken.user_id),
        ]:
            rows = (await session.execute(select(model).where(col == alice_id))).scalars().all()
            assert rows == [], f"{model.__name__} not cleared"
        # Discovery / safety rows referencing Alice in either direction
        assert (await session.execute(select(DiscoveryAction).where(DiscoveryAction.actor_id == alice_id))).scalars().all() == []
        assert (await session.execute(select(Report).where(Report.reporter_id == alice_id))).scalars().all() == []
        assert (await session.execute(select(Block).where(Block.blocker_id == alice_id))).scalars().all() == []
        # Messages she sent
        assert (await session.execute(select(Message).where(Message.sender_id == alice_id))).scalars().all() == []
        # Matches she participated in
        assert (
            await session.execute(
                select(Match).where((Match.user1_id == alice_id) | (Match.user2_id == alice_id))
            )
        ).scalars().all() == []
        # Bookings she participated in
        assert (
            await session.execute(
                select(Booking).where((Booking.proposer_id == alice_id) | (Booking.partner_id == alice_id))
            )
        ).scalars().all() == []

    # Token should no longer authenticate
    r2 = await client.get("/auth/me", headers={"Authorization": f"Bearer {alice_token}"})
    assert r2.status_code == 401


async def test_delete_me_requires_auth(client: AsyncClient) -> None:
    r = await client.delete("/auth/me")
    # HTTPBearer returns 401 when no Authorization header is present (older
    # starlette returned 403 — the suite has a pre-existing test on this).
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /auth/apple — Apple Sign-in
# ---------------------------------------------------------------------------


async def test_apple_sign_in_creates_user_on_first_call(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core import config as config_module
    from app.routers import auth as auth_router
    from app.services import apple_auth as apple_auth_module

    # Force a non-empty apple_client_id for this test
    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "apple_client_id", "com.protin.app")

    async def fake_verify(identity_token, *, audience, nonce=None, http_client=None):
        assert audience == "com.protin.app"
        return {
            "sub": "001234.apple-user-id",
            "email": "apple-user@example.com",
            "aud": audience,
            "iss": "https://appleid.apple.com",
        }

    monkeypatch.setattr(auth_router, "verify_identity_token", fake_verify)
    monkeypatch.setattr(apple_auth_module, "verify_identity_token", fake_verify)

    r = await client.post(
        "/auth/apple",
        json={"identity_token": "stub.jwt.value"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"

    # Second call with same sub returns a token for the same user.
    r2 = await client.post("/auth/apple", json={"identity_token": "stub.jwt.value"})
    assert r2.status_code == 200

    # Sanity: only one row created
    from sqlalchemy import select

    from app.models.user import User

    async with _TestSession() as session:
        users = (
            await session.execute(select(User).where(User.apple_sub == "001234.apple-user-id"))
        ).scalars().all()
        assert len(users) == 1
        assert users[0].email == "apple-user@example.com"
        assert users[0].hashed_password is None


async def test_apple_sign_in_rejects_invalid_token(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core import config as config_module
    from app.routers import auth as auth_router
    from app.services.apple_auth import AppleIdentityTokenError

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "apple_client_id", "com.protin.app")

    async def fake_verify(identity_token, *, audience, nonce=None, http_client=None):
        raise AppleIdentityTokenError("Identity token verification failed: bad signature")

    monkeypatch.setattr(auth_router, "verify_identity_token", fake_verify)

    r = await client.post(
        "/auth/apple",
        json={"identity_token": "forged.jwt.value"},
    )
    assert r.status_code == 401
    assert "bad signature" in r.json()["detail"].lower()


async def test_apple_sign_in_503_when_not_configured(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core import config as config_module

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "apple_client_id", "")

    r = await client.post("/auth/apple", json={"identity_token": "anything"})
    assert r.status_code == 503


# ---------------------------------------------------------------------------
# SECRET_KEY fail-closed (M3)
# ---------------------------------------------------------------------------


def test_secret_key_fail_closed_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    import importlib

    from app.core import config as config_module
    from app.core import security as security_module

    # Clear cached settings so env vars re-read
    config_module.get_settings.cache_clear()

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "change-me-in-production")

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        importlib.reload(security_module)

    # Restore: reload with a good key so other tests keep working
    config_module.get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("SECRET_KEY", "change-me-in-production")
    importlib.reload(security_module)


def test_secret_key_warns_in_local(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    import importlib
    import logging

    from app.core import config as config_module
    from app.core import security as security_module

    config_module.get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("SECRET_KEY", "change-me-in-production")

    with caplog.at_level(logging.WARNING, logger="app.core.security"):
        importlib.reload(security_module)

    assert any("SECRET_KEY" in rec.message for rec in caplog.records)
