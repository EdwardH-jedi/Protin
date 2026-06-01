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


async def test_login_then_me_returns_logged_in_user_not_another(
    client: AsyncClient,
) -> None:
    """
    Regression pin: backing the local-only reviewer flow.

    A second login (different email) must mint a token whose ``/auth/me``
    resolves to the second user — never to the first. The mobile auth
    store relies on this contract; if it ever broke, ``/auth/me`` could
    silently return a stale identity after an account switch.
    """
    # First account
    a_payload = {"email": "switch_a@example.com", "password": "password123"}
    await client.post("/auth/register", json=a_payload)

    # Second account
    b_payload = {"email": "switch_b@example.com", "password": "password123"}
    await client.post("/auth/register", json=b_payload)

    # Log in as A and pin identity.
    a_login = await client.post("/auth/login", json=a_payload)
    a_token = a_login.json()["access_token"]
    a_me = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {a_token}"}
    )
    assert a_me.status_code == 200
    assert a_me.json()["email"] == "switch_a@example.com"

    # Log in as B; B's token must NOT resolve to A.
    b_login = await client.post("/auth/login", json=b_payload)
    b_token = b_login.json()["access_token"]
    assert b_token != a_token
    b_me = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {b_token}"}
    )
    assert b_me.status_code == 200
    assert b_me.json()["email"] == "switch_b@example.com"
    assert b_me.json()["id"] != a_me.json()["id"]


async def test_get_me_with_no_token_returns_401(client: AsyncClient) -> None:
    r = await client.get("/auth/me")
    # FastAPI's HTTPBearer returned 403 historically; current versions
    # return 401 with `Not authenticated`. Accept both so we don't pin the
    # test to one FastAPI/Starlette internals revision.
    assert r.status_code in (401, 403)


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


async def test_apple_sign_in_links_existing_user_by_verified_email(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An existing email/password user gets apple_sub attached when the
    verified email in the identity token matches their registered email.
    """
    from sqlalchemy import select

    from app.core import config as config_module
    from app.models.user import User
    from app.routers import auth as auth_router

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "apple_client_id", "com.protin.app")

    # Seed an email/password user directly (no /register dependency on bcrypt).
    async with _TestSession() as session:
        existing = User(email="link-me@example.com", hashed_password="x" * 60)
        session.add(existing)
        await session.commit()
        existing_id = existing.id

    async def fake_verify(identity_token, *, audience, nonce=None, http_client=None):
        return {
            "sub": "002468.apple-link-user",
            "email": "link-me@example.com",
            "aud": audience,
            "iss": "https://appleid.apple.com",
        }

    monkeypatch.setattr(auth_router, "verify_identity_token", fake_verify)

    r = await client.post("/auth/apple", json={"identity_token": "stub.jwt.value"})
    assert r.status_code == 200, r.text

    async with _TestSession() as session:
        row = (
            await session.execute(select(User).where(User.id == existing_id))
        ).scalar_one()
        assert row.apple_sub == "002468.apple-link-user"
        # Original hashed_password is preserved — linking does not wipe credentials.
        assert row.hashed_password == "x" * 60


async def test_apple_sign_in_does_not_link_via_client_supplied_email(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Hardening: an attacker forging body.email must NOT be able to attach
    their apple_sub to a victim's existing email/password account when the
    identity token does not carry a verified email claim. The request fails
    with 400 (no verified email for new account creation) and the victim's
    row remains untouched.
    """
    from sqlalchemy import select

    from app.core import config as config_module
    from app.models.user import User
    from app.routers import auth as auth_router

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "apple_client_id", "com.protin.app")

    async with _TestSession() as session:
        victim = User(email="victim@example.com", hashed_password="x" * 60)
        session.add(victim)
        await session.commit()
        victim_id = victim.id

    async def fake_verify(identity_token, *, audience, nonce=None, http_client=None):
        # Apple omits the email claim (returning user / re-auth case).
        return {
            "sub": "009999.attacker-apple-sub",
            "aud": audience,
            "iss": "https://appleid.apple.com",
        }

    monkeypatch.setattr(auth_router, "verify_identity_token", fake_verify)

    r = await client.post(
        "/auth/apple",
        json={
            "identity_token": "stub.jwt.value",
            "email": "victim@example.com",  # forged
        },
    )
    # Either 409 (email collides on the new-user insert path) or 400 — both
    # are safe outcomes. The behaviour we are asserting is the negative one:
    # the victim's row must NOT have been touched.
    assert r.status_code in (400, 409), r.text

    async with _TestSession() as session:
        row = (
            await session.execute(select(User).where(User.id == victim_id))
        ).scalar_one()
        assert row.apple_sub is None, "victim row was linked via forged body.email"


async def test_apple_sign_in_propagates_nonce_mismatch_as_401(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A nonce mismatch raised by the verifier must surface as 401, not 500."""
    from app.core import config as config_module
    from app.routers import auth as auth_router
    from app.services.apple_auth import AppleIdentityTokenError

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "apple_client_id", "com.protin.app")

    async def fake_verify(identity_token, *, audience, nonce=None, http_client=None):
        raise AppleIdentityTokenError("Nonce mismatch")

    monkeypatch.setattr(auth_router, "verify_identity_token", fake_verify)

    r = await client.post(
        "/auth/apple",
        json={"identity_token": "stub.jwt.value", "nonce": "client-nonce"},
    )
    assert r.status_code == 401
    assert "nonce" in r.json()["detail"].lower()


async def test_apple_sign_in_first_time_without_verified_email_is_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A first-ever Apple sign-in whose token does NOT carry an `email` claim
    must be rejected with 400 — even if the client supplies a body.email.
    No new user row may be created in this case.
    """
    from sqlalchemy import select

    from app.core import config as config_module
    from app.models.user import User
    from app.routers import auth as auth_router

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "apple_client_id", "com.protin.app")

    apple_sub = "001111.no-verified-email-user"

    async def fake_verify(identity_token, *, audience, nonce=None, http_client=None):
        # No "email" claim — Apple omits it for returning users whose
        # server-side row was previously deleted.
        return {
            "sub": apple_sub,
            "aud": audience,
            "iss": "https://appleid.apple.com",
        }

    monkeypatch.setattr(auth_router, "verify_identity_token", fake_verify)

    # Even with a client-supplied email in the body, the server must refuse.
    r = await client.post(
        "/auth/apple",
        json={"identity_token": "stub.jwt.value", "email": "anything@example.com"},
    )
    assert r.status_code == 400, r.text
    assert "email" in r.json()["detail"].lower()

    # Confirm no row was created under either the body email or the apple_sub.
    async with _TestSession() as session:
        rows_by_sub = (
            await session.execute(select(User).where(User.apple_sub == apple_sub))
        ).scalars().all()
        assert rows_by_sub == []
        rows_by_email = (
            await session.execute(select(User).where(User.email == "anything@example.com"))
        ).scalars().all()
        assert rows_by_email == []


async def test_password_login_rejects_apple_only_account(client: AsyncClient) -> None:
    """An Apple-only user has hashed_password IS NULL. The /auth/login endpoint
    must refuse password authentication for such accounts (no fallback path
    that treats NULL as a wildcard or silently authenticates)."""
    from app.models.user import User

    async with _TestSession() as session:
        apple_only = User(
            email="apple-only@example.com",
            hashed_password=None,
            apple_sub="003333.apple-only-user",
        )
        session.add(apple_only)
        await session.commit()

    # Attempt password login with an arbitrary password — must be rejected
    # exactly the same way a wrong password would be.
    r = await client.post(
        "/auth/login",
        json={"email": "apple-only@example.com", "password": "anything-here"},
    )
    assert r.status_code == 401


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


# ---------------------------------------------------------------------------
# Sign in with Apple token revocation on account deletion (App Store 5.1.1(v))
# ---------------------------------------------------------------------------


def _configure_apple_revocation(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set the four Apple-revocation settings so ``apple_revocation_configured``
    returns True. The exchange/revoke helpers themselves are monkeypatched in
    these route tests, so the private key value is never actually signed."""
    from app.core import config as config_module

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "apple_client_id", "com.protin.app")
    monkeypatch.setattr(settings, "apple_team_id", "TEAM123456")
    monkeypatch.setattr(settings, "apple_key_id", "KEY1234567")
    monkeypatch.setattr(settings, "apple_private_key", "dummy-pem")


async def test_apple_sign_in_stores_refresh_token_when_code_provided(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When the client forwards an authorization_code and Apple is configured,
    the backend exchanges it and persists the refresh token for later revoke."""
    from sqlalchemy import select

    from app.models.user import User
    from app.routers import auth as auth_router
    from app.services import apple_auth as apple_auth_module

    _configure_apple_revocation(monkeypatch)

    async def fake_verify(identity_token, *, audience, nonce=None, http_client=None):
        return {
            "sub": "00aaaa.refresh-store-user",
            "email": "refresh-store@example.com",
            "aud": audience,
            "iss": "https://appleid.apple.com",
        }

    monkeypatch.setattr(auth_router, "verify_identity_token", fake_verify)
    monkeypatch.setattr(apple_auth_module, "verify_identity_token", fake_verify)

    async def fake_exchange(code, *, settings, http_client=None):
        assert code == "auth-code-xyz"
        return "refresh-token-123"

    monkeypatch.setattr(auth_router, "exchange_authorization_code", fake_exchange)

    r = await client.post(
        "/auth/apple",
        json={"identity_token": "stub.jwt.value", "authorization_code": "auth-code-xyz"},
    )
    assert r.status_code == 200, r.text

    async with _TestSession() as session:
        user = (
            await session.execute(select(User).where(User.apple_sub == "00aaaa.refresh-store-user"))
        ).scalar_one()
        # EncryptedString round-trips to plaintext on read.
        assert user.apple_refresh_token == "refresh-token-123"


async def test_apple_sign_in_succeeds_when_token_exchange_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A failing token exchange must NOT break sign-in — the refresh token is a
    best-effort enrichment, not a precondition for authentication."""
    from sqlalchemy import select

    from app.models.user import User
    from app.routers import auth as auth_router
    from app.services import apple_auth as apple_auth_module

    _configure_apple_revocation(monkeypatch)

    async def fake_verify(identity_token, *, audience, nonce=None, http_client=None):
        return {
            "sub": "00bbbb.exchange-fail-user",
            "email": "exchange-fail@example.com",
            "aud": audience,
            "iss": "https://appleid.apple.com",
        }

    monkeypatch.setattr(auth_router, "verify_identity_token", fake_verify)
    monkeypatch.setattr(apple_auth_module, "verify_identity_token", fake_verify)

    async def boom_exchange(code, *, settings, http_client=None):
        raise RuntimeError("Apple token endpoint returned 400")

    monkeypatch.setattr(auth_router, "exchange_authorization_code", boom_exchange)

    r = await client.post(
        "/auth/apple",
        json={"identity_token": "stub.jwt.value", "authorization_code": "auth-code-xyz"},
    )
    assert r.status_code == 200, r.text

    async with _TestSession() as session:
        user = (
            await session.execute(select(User).where(User.apple_sub == "00bbbb.exchange-fail-user"))
        ).scalar_one()
        assert user.apple_refresh_token is None


async def test_delete_me_revokes_apple_token_then_deletes_user(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Deleting an Apple-linked account revokes the stored refresh token and
    then removes the local user row."""
    from sqlalchemy import select

    from app.core.security import create_access_token
    from app.models.user import User
    from app.routers import auth as auth_router

    _configure_apple_revocation(monkeypatch)

    async with _TestSession() as session:
        user = User(
            email="apple-del@example.com",
            hashed_password=None,
            apple_sub="00cccc.apple-delete-user",
            apple_refresh_token="rt-to-revoke",
        )
        session.add(user)
        await session.flush()
        user_id = user.id
        await session.commit()

    revoked: list[str] = []

    async def fake_revoke(token, *, settings, http_client=None):
        revoked.append(token)

    monkeypatch.setattr(auth_router, "revoke_refresh_token", fake_revoke)

    token = create_access_token(str(user_id))
    r = await client.delete("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204

    # Revoke was called once, with the user's decrypted refresh token.
    assert revoked == ["rt-to-revoke"]

    async with _TestSession() as session:
        assert (
            await session.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none() is None


async def test_delete_me_does_not_revoke_for_email_user(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An email/password user (no apple_refresh_token) must not trigger any
    Apple revoke call on deletion."""
    from app.core.security import create_access_token
    from app.models.user import User
    from app.routers import auth as auth_router

    # Apple IS configured — proving the skip is driven by the absent token,
    # not by missing configuration.
    _configure_apple_revocation(monkeypatch)

    async with _TestSession() as session:
        user = User(email="email-del@example.com", hashed_password="x" * 60)
        session.add(user)
        await session.flush()
        user_id = user.id
        await session.commit()

    revoked: list[str] = []

    async def fake_revoke(token, *, settings, http_client=None):
        revoked.append(token)

    monkeypatch.setattr(auth_router, "revoke_refresh_token", fake_revoke)

    token = create_access_token(str(user_id))
    r = await client.delete("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204
    assert revoked == []


async def test_delete_me_completes_when_apple_revoke_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If Apple's revoke endpoint fails, account deletion must still complete —
    deletion is never weakened by a best-effort revocation step."""
    from sqlalchemy import select

    from app.core.security import create_access_token
    from app.models.user import User
    from app.routers import auth as auth_router

    _configure_apple_revocation(monkeypatch)

    async with _TestSession() as session:
        user = User(
            email="apple-del-fail@example.com",
            hashed_password=None,
            apple_sub="00dddd.apple-revoke-fail",
            apple_refresh_token="rt-doomed",
        )
        session.add(user)
        await session.flush()
        user_id = user.id
        await session.commit()

    async def boom_revoke(token, *, settings, http_client=None):
        raise RuntimeError("Apple revoke endpoint returned 500")

    monkeypatch.setattr(auth_router, "revoke_refresh_token", boom_revoke)

    token = create_access_token(str(user_id))
    r = await client.delete("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204

    async with _TestSession() as session:
        assert (
            await session.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none() is None
