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

# Import model modules for SQLAlchemy registration. `booking` is aliased so
# it doesn't shadow local `booking` test-instance variables (ruff F811).
from app.models import match, profile, user, chat  # noqa: F401
from app.models import booking as _booking_model  # noqa: F401
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


# ---------------------------------------------------------------------------
# _render unit tests  (pure function, no DB)
# ---------------------------------------------------------------------------


def test_render_capitalises_sport():
    from app.services.notifications import _render

    result = _render("You have a {sport} session", partner="Alex", sport="gym")
    assert "Gym" in result


def test_render_substitutes_partner():
    from app.services.notifications import _render

    result = _render("{partner} wants to book", partner="Jordan", sport="golf")
    assert "Jordan" in result
    assert "{partner}" not in result


# ---------------------------------------------------------------------------
# schedule_booking_notification unit tests  (in-process, no HTTP)
# ---------------------------------------------------------------------------


async def test_schedule_immediate_notification_sets_scheduled_at_to_now():
    """proposal_received notifications are scheduled immediately."""
    from datetime import datetime, timezone
    from unittest.mock import AsyncMock, MagicMock

    from app.models.booking import Booking
    from app.services.notifications import schedule_booking_notification

    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    booking = Booking.__new__(Booking)
    booking.id = None
    booking.sport = "gym"
    from datetime import timedelta

    booking.starts_at = datetime.now(tz=timezone.utc) + timedelta(days=7)

    before = datetime.now(tz=timezone.utc)
    await schedule_booking_notification(db, booking, "proposal_received", None, "Alex")
    after = datetime.now(tz=timezone.utc)

    db.add.assert_called_once()
    event = db.add.call_args[0][0]
    assert before <= event.scheduled_at <= after


async def test_schedule_reminder_is_24h_before_starts_at():
    """Reminder notifications are scheduled 24 h before starts_at."""
    from datetime import datetime, timedelta, timezone
    from unittest.mock import AsyncMock, MagicMock

    from app.models.booking import Booking
    from app.services.notifications import schedule_booking_notification

    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    starts = datetime.now(tz=timezone.utc) + timedelta(days=3)
    booking = Booking.__new__(Booking)
    booking.id = None
    booking.sport = "tennis"
    booking.starts_at = starts

    await schedule_booking_notification(db, booking, "reminder", None, "Sam")

    db.add.assert_called_once()
    event = db.add.call_args[0][0]
    expected = starts - timedelta(hours=24)
    diff = abs((event.scheduled_at - expected).total_seconds())
    assert diff < 1, f"scheduled_at {event.scheduled_at} not close to {expected}"


async def test_schedule_reminder_skipped_when_starts_at_in_past():
    """No NotificationEvent is added when starts_at is already past the 24 h window."""
    from datetime import datetime, timedelta, timezone
    from unittest.mock import AsyncMock, MagicMock

    from app.models.booking import Booking
    from app.services.notifications import schedule_booking_notification

    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    booking = Booking.__new__(Booking)
    booking.id = None
    booking.sport = "gym"
    booking.starts_at = datetime.now(tz=timezone.utc) - timedelta(hours=1)

    await schedule_booking_notification(db, booking, "reminder", None, "Lee")
    db.add.assert_not_called()


# ---------------------------------------------------------------------------
# Token reassignment
# ---------------------------------------------------------------------------


async def test_token_reassigned_to_new_user(client: AsyncClient) -> None:
    """Registering a token already held by user A under user B transfers ownership."""
    token_a, uid_a = await _register(client, "notif_reassign_a@example.com")
    token_b, uid_b = await _register(client, "notif_reassign_b@example.com")

    shared_push = "ExponentPushToken[shared-device]"

    r1 = await client.post(
        "/notifications/token",
        json={"token": shared_push, "platform": "ios"},
        headers=_auth(token_a),
    )
    assert r1.status_code == 201
    record_id = r1.json()["id"]

    r2 = await client.post(
        "/notifications/token",
        json={"token": shared_push, "platform": "ios"},
        headers=_auth(token_b),
    )
    assert r2.status_code == 201
    # Same DB row, but now owned by user B
    assert r2.json()["id"] == record_id


# ---------------------------------------------------------------------------
# Transition notifications
# ---------------------------------------------------------------------------


async def _setup_match_and_booking(client: AsyncClient) -> tuple[str, str, str, str, str]:
    """Register two users, mutual-like to create a match, propose a booking.
    Returns (token_a, uid_a, token_b, uid_b, booking_id).
    """
    import uuid
    suffix = uuid.uuid4().hex[:8]
    token_a, uid_a = await _register(client, f"notif_trans_a_{suffix}@example.com")
    token_b, uid_b = await _register(client, f"notif_trans_b_{suffix}@example.com")

    await client.put("/users/me/profile", json={"display_name": "User A"}, headers=_auth(token_a))
    await client.put("/users/me/profile", json={"display_name": "User B"}, headers=_auth(token_b))

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

    book_r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": "2026-08-01T09:00:00Z",
            "ends_at": "2026-08-01T10:00:00Z",
        },
        headers=_auth(token_a),
    )
    assert book_r.status_code == 201
    return token_a, uid_a, token_b, uid_b, book_r.json()["id"]


async def test_confirm_transition_schedules_booking_confirmed_notification(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token_a, uid_a, token_b, uid_b, booking_id = await _setup_match_and_booking(client)

    scheduled: list[tuple] = []

    async def _capture(db, booking, notif_type, recipient_id, partner_name):
        scheduled.append((notif_type, str(recipient_id)))

    import app.services.bookings as bookings_svc
    monkeypatch.setattr(bookings_svc.notif_service, "schedule_booking_notification", _capture)

    r = await client.post(
        f"/bookings/{booking_id}/confirm",
        headers=_auth(token_b),
    )
    assert r.status_code == 200

    notif_types = [t for t, _ in scheduled]
    assert "booking_confirmed" in notif_types
    # Reminders scheduled for both participants
    assert notif_types.count("reminder") == 2


async def test_decline_transition_schedules_booking_declined_notification(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token_a, uid_a, token_b, uid_b, booking_id = await _setup_match_and_booking(client)

    scheduled: list[tuple] = []

    async def _capture(db, booking, notif_type, recipient_id, partner_name):
        scheduled.append((notif_type, str(recipient_id)))

    import app.services.bookings as bookings_svc
    monkeypatch.setattr(bookings_svc.notif_service, "schedule_booking_notification", _capture)

    r = await client.post(
        f"/bookings/{booking_id}/decline",
        headers=_auth(token_b),
    )
    assert r.status_code == 200
    assert any(t == "booking_declined" for t, _ in scheduled)


async def test_cancel_transition_schedules_booking_cancelled_notification(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token_a, uid_a, token_b, uid_b, booking_id = await _setup_match_and_booking(client)

    scheduled: list[tuple] = []

    async def _capture(db, booking, notif_type, recipient_id, partner_name):
        scheduled.append((notif_type, str(recipient_id)))

    import app.services.bookings as bookings_svc
    monkeypatch.setattr(bookings_svc.notif_service, "schedule_booking_notification", _capture)

    r = await client.post(
        f"/bookings/{booking_id}/cancel",
        headers=_auth(token_a),
    )
    assert r.status_code == 200
    assert any(t == "booking_cancelled" for t, _ in scheduled)


# ---------------------------------------------------------------------------
# process_pending_notifications delivery behaviour
# ---------------------------------------------------------------------------


async def test_process_marks_sent_on_success(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Successful Expo delivery increments processed count and marks sent_at."""
    import app.services.notifications as notif_svc

    async def _always_ok(token, title, body, data) -> bool:
        return True

    monkeypatch.setattr(notif_svc, "_send_expo_push", _always_ok)

    token_a, uid_a = await _register(client, "notif_proc_ok_a@example.com")
    token_b, uid_b = await _register(client, "notif_proc_ok_b@example.com")

    await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[proc-ok-b]", "platform": "ios"},
        headers=_auth(token_b),
    )

    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    await client.put("/users/me/profile", json={"display_name": "OK A"}, headers=_auth(token_a))
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    match_id = r.json()["match_id"]

    await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": "2026-09-01T09:00:00Z",
            "ends_at": "2026-09-01T10:00:00Z",
        },
        headers=_auth(token_a),
    )

    proc_r = await client.post("/internal/process-notifications")
    assert proc_r.status_code == 200
    body = proc_r.json()
    assert body["processed"] >= 1
    assert body["failed"] == 0


async def test_process_marks_failed_on_delivery_error(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Failed Expo delivery increments failed count."""
    import app.services.notifications as notif_svc

    async def _always_fail(token, title, body, data) -> bool:
        return False

    monkeypatch.setattr(notif_svc, "_send_expo_push", _always_fail)

    token_a, uid_a = await _register(client, "notif_proc_fail_a@example.com")
    token_b, uid_b = await _register(client, "notif_proc_fail_b@example.com")

    await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[proc-fail-b]", "platform": "ios"},
        headers=_auth(token_b),
    )
    await client.put("/users/me/profile", json={"display_name": "Fail A"}, headers=_auth(token_a))

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

    await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": "2026-09-10T09:00:00Z",
            "ends_at": "2026-09-10T10:00:00Z",
        },
        headers=_auth(token_a),
    )

    proc_r = await client.post("/internal/process-notifications")
    assert proc_r.status_code == 200
    body = proc_r.json()
    assert body["failed"] >= 1


async def test_process_skips_already_sent_events(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Running process-notifications twice must not re-send already-sent events."""
    import app.services.notifications as notif_svc

    call_count = 0

    async def _count_calls(token, title, body, data) -> bool:
        nonlocal call_count
        call_count += 1
        return True

    monkeypatch.setattr(notif_svc, "_send_expo_push", _count_calls)

    token_a, uid_a = await _register(client, "notif_dedup_a@example.com")
    token_b, uid_b = await _register(client, "notif_dedup_b@example.com")

    await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[dedup-b]", "platform": "ios"},
        headers=_auth(token_b),
    )
    await client.put("/users/me/profile", json={"display_name": "Dedup A"}, headers=_auth(token_a))

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

    await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": "2026-09-20T09:00:00Z",
            "ends_at": "2026-09-20T10:00:00Z",
        },
        headers=_auth(token_a),
    )

    await client.post("/internal/process-notifications")
    first_count = call_count

    await client.post("/internal/process-notifications")
    # No new calls on second run
    assert call_count == first_count
