"""Venue endpoint + nearby ordering tests using in-memory SQLite."""

from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app

# Import all models so Base.metadata.create_all builds every table the
# venue tests touch (bookings has a FK to venues now).
from app.models import (  # noqa: F401
    booking,
    chat,
    match,
    profile,
    safety,
    user,
    venue,
)
from app.models.venue import Venue

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
    return r.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _seed_venue(
    *,
    name: str,
    sport_tags: list[str],
    lat: float,
    lng: float,
    area: str | None = None,
    booking_url: str | None = None,
    is_bookable: bool = False,
) -> str:
    """Insert a venue directly into the test session and return its id."""
    async with _TestSession() as db:
        v = Venue(
            id=uuid4(),
            name=name,
            sport_tags=sport_tags,
            area=area,
            latitude=lat,
            longitude=lng,
            booking_url=booking_url,
            is_bookable=is_bookable,
        )
        db.add(v)
        await db.commit()
        return str(v.id)


async def _wipe_venues() -> None:
    """Tests share a module-scoped DB; clean the table between tests."""
    from sqlalchemy import delete

    async with _TestSession() as db:
        await db.execute(delete(Venue))
        await db.commit()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_nearby_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/venues/nearby", params={"sport": "tennis"})
    assert r.status_code in (401, 403)


async def test_nearby_filters_by_sport(client: AsyncClient) -> None:
    await _wipe_venues()
    await _seed_venue(name="Tennis A", sport_tags=["tennis"], lat=-33.89, lng=151.22)
    await _seed_venue(name="Golf B", sport_tags=["golf"], lat=-33.90, lng=151.22)

    token = await _register(client, "venue_filter@example.com")
    r = await client.get("/venues/nearby", params={"sport": "tennis"}, headers=_auth(token))
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Tennis A"


async def test_nearby_returns_results_sorted_by_distance(client: AsyncClient) -> None:
    """A query at Bondi (~-33.89, 151.27) should return Bondi venue first."""
    await _wipe_venues()
    await _seed_venue(name="Far", sport_tags=["running"], lat=-33.80, lng=151.00)  # Parramatta-ish
    await _seed_venue(name="Near", sport_tags=["running"], lat=-33.89, lng=151.27)  # Bondi
    await _seed_venue(name="Mid", sport_tags=["running"], lat=-33.88, lng=151.21)   # Surry Hills-ish

    token = await _register(client, "venue_sort@example.com")
    r = await client.get(
        "/venues/nearby",
        params={"sport": "running", "lat": -33.89, "lng": 151.27},
        headers=_auth(token),
    )
    assert r.status_code == 200
    body = r.json()
    names = [v["name"] for v in body["items"]]
    # Near < Mid < Far on a great-circle from Bondi.
    assert names == ["Near", "Mid", "Far"]
    # All entries get a distance_km when lat/lng were supplied.
    assert all(v["distance_km"] is not None for v in body["items"])
    # Distance is monotonically non-decreasing.
    distances = [v["distance_km"] for v in body["items"]]
    assert distances == sorted(distances)


async def test_nearby_without_lat_lng_falls_back_alphabetically(client: AsyncClient) -> None:
    """MVP fallback path while expo-location is not installed."""
    await _wipe_venues()
    await _seed_venue(name="Charlie", sport_tags=["gym"], lat=-33.89, lng=151.22)
    await _seed_venue(name="Alpha", sport_tags=["gym"], lat=-33.90, lng=151.23)
    await _seed_venue(name="Bravo", sport_tags=["gym"], lat=-33.88, lng=151.21)

    token = await _register(client, "venue_nogeo@example.com")
    r = await client.get("/venues/nearby", params={"sport": "gym"}, headers=_auth(token))
    assert r.status_code == 200
    items = r.json()["items"]
    names = [v["name"] for v in items]
    assert names == ["Alpha", "Bravo", "Charlie"]
    # No coordinates supplied → distance_km is None.
    assert all(v["distance_km"] is None for v in items)


async def test_nearby_serializes_booking_url_when_bookable(client: AsyncClient) -> None:
    await _wipe_venues()
    await _seed_venue(
        name="Bookable Court",
        sport_tags=["tennis"],
        lat=-33.89,
        lng=151.22,
        booking_url="https://example.com/book/court-1",
        is_bookable=True,
    )

    token = await _register(client, "venue_bookable@example.com")
    r = await client.get("/venues/nearby", params={"sport": "tennis"}, headers=_auth(token))
    assert r.status_code == 200
    item = r.json()["items"][0]
    assert item["booking_url"] == "https://example.com/book/court-1"
    assert item["is_bookable"] is True


async def test_nearby_lat_without_lng_returns_422(client: AsyncClient) -> None:
    token = await _register(client, "venue_partial@example.com")
    r = await client.get(
        "/venues/nearby",
        params={"sport": "tennis", "lat": -33.89},
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_create_booking_with_venue_id_persists_and_returns_venue(client: AsyncClient) -> None:
    """Integration: a booking with venue_id resolves the venue in the response."""
    await _wipe_venues()
    venue_id = await _seed_venue(
        name="Tennis Court Z", sport_tags=["tennis"], lat=-33.89, lng=151.22
    )

    # Two registered users with a mutual match — pattern lifted from test_bookings.
    a_tok = (
        await client.post("/auth/register", json={"email": "vbook_a@example.com", "password": "password123"})
    ).json()["access_token"]
    a_uid = (await client.get("/auth/me", headers=_auth(a_tok))).json()["id"]
    b_tok = (
        await client.post("/auth/register", json={"email": "vbook_b@example.com", "password": "password123"})
    ).json()["access_token"]
    b_uid = (await client.get("/auth/me", headers=_auth(b_tok))).json()["id"]
    await client.post(
        "/discovery/actions",
        json={"target_user_id": b_uid, "action": "like", "sport": "tennis"},
        headers=_auth(a_tok),
    )
    match_resp = await client.post(
        "/discovery/actions",
        json={"target_user_id": a_uid, "action": "like", "sport": "tennis"},
        headers=_auth(b_tok),
    )
    match_id = match_resp.json()["match_id"]

    r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "tennis",
            "starts_at": "2030-04-01T09:00:00Z",
            "ends_at": "2030-04-01T10:00:00Z",
            "venue_id": venue_id,
        },
        headers=_auth(a_tok),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["venue"] is not None
    assert body["venue"]["id"] == venue_id
    assert body["venue"]["name"] == "Tennis Court Z"


def test_gcal_event_falls_back_to_venue_when_location_blank() -> None:
    """
    Codex Blocker 3: a venue-only booking must not produce a calendar
    event with a blank location field. _resolve_event_location applies
    the same fallback chain as the mobile composer.
    """
    from datetime import datetime, timezone

    from app.models.booking import Booking
    from app.models.venue import Venue
    from app.services.google_calendar import _resolve_event_location

    b = Booking(
        match_id=uuid4(),
        proposer_id=uuid4(),
        partner_id=uuid4(),
        sport="tennis",
        starts_at=datetime(2030, 4, 1, 9, tzinfo=timezone.utc),
        ends_at=datetime(2030, 4, 1, 10, tzinfo=timezone.utc),
        location=None,
        notes=None,
        status="confirmed",
    )
    v = Venue(
        name="Tennis Court Alpha",
        sport_tags=["tennis"],
        area="Bondi",
        address="1 Beach Rd, Bondi NSW",
        latitude=-33.89,
        longitude=151.27,
        booking_url=None,
        notes=None,
        is_bookable=False,
    )
    assert _resolve_event_location(b, v) == "Tennis Court Alpha — 1 Beach Rd, Bondi NSW"


def test_gcal_event_typed_location_wins_over_venue() -> None:
    """Manually typed location must take precedence over the venue fallback."""
    from datetime import datetime, timezone

    from app.models.booking import Booking
    from app.models.venue import Venue
    from app.services.google_calendar import _resolve_event_location

    b = Booking(
        match_id=uuid4(),
        proposer_id=uuid4(),
        partner_id=uuid4(),
        sport="tennis",
        starts_at=datetime(2030, 4, 1, 9, tzinfo=timezone.utc),
        ends_at=datetime(2030, 4, 1, 10, tzinfo=timezone.utc),
        location="Custom override location",
        notes=None,
        status="confirmed",
    )
    v = Venue(
        name="Tennis Court Alpha",
        sport_tags=["tennis"],
        area="Bondi",
        address=None,
        latitude=0,
        longitude=0,
        booking_url=None,
        notes=None,
        is_bookable=False,
    )
    assert _resolve_event_location(b, v) == "Custom override location"


def test_gcal_event_falls_back_to_area_when_address_missing() -> None:
    from datetime import datetime, timezone

    from app.models.booking import Booking
    from app.models.venue import Venue
    from app.services.google_calendar import _resolve_event_location

    b = Booking(
        match_id=uuid4(),
        proposer_id=uuid4(),
        partner_id=uuid4(),
        sport="tennis",
        starts_at=datetime(2030, 4, 1, 9, tzinfo=timezone.utc),
        ends_at=datetime(2030, 4, 1, 10, tzinfo=timezone.utc),
        location="",
        notes=None,
        status="confirmed",
    )
    v = Venue(
        name="Tennis Court Alpha",
        sport_tags=["tennis"],
        area="Bondi",
        address=None,
        latitude=0,
        longitude=0,
        booking_url=None,
        notes=None,
        is_bookable=False,
    )
    assert _resolve_event_location(b, v) == "Tennis Court Alpha — Bondi"


def test_gcal_event_returns_empty_when_neither_location_nor_venue() -> None:
    from datetime import datetime, timezone

    from app.models.booking import Booking
    from app.services.google_calendar import _resolve_event_location

    b = Booking(
        match_id=uuid4(),
        proposer_id=uuid4(),
        partner_id=uuid4(),
        sport="tennis",
        starts_at=datetime(2030, 4, 1, 9, tzinfo=timezone.utc),
        ends_at=datetime(2030, 4, 1, 10, tzinfo=timezone.utc),
        location=None,
        notes=None,
        status="confirmed",
    )
    assert _resolve_event_location(b, None) == ""


async def test_create_booking_with_mismatched_venue_sport_returns_422(client: AsyncClient) -> None:
    """Booking sport=tennis but venue serves only golf → 422."""
    await _wipe_venues()
    venue_id = await _seed_venue(
        name="Golf Only", sport_tags=["golf"], lat=-33.89, lng=151.22
    )

    a_tok = (
        await client.post("/auth/register", json={"email": "vmm_a@example.com", "password": "password123"})
    ).json()["access_token"]
    a_uid = (await client.get("/auth/me", headers=_auth(a_tok))).json()["id"]
    b_tok = (
        await client.post("/auth/register", json={"email": "vmm_b@example.com", "password": "password123"})
    ).json()["access_token"]
    b_uid = (await client.get("/auth/me", headers=_auth(b_tok))).json()["id"]
    await client.post(
        "/discovery/actions",
        json={"target_user_id": b_uid, "action": "like", "sport": "tennis"},
        headers=_auth(a_tok),
    )
    match_resp = await client.post(
        "/discovery/actions",
        json={"target_user_id": a_uid, "action": "like", "sport": "tennis"},
        headers=_auth(b_tok),
    )
    match_id = match_resp.json()["match_id"]

    r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "tennis",
            "starts_at": "2030-04-01T09:00:00Z",
            "ends_at": "2030-04-01T10:00:00Z",
            "venue_id": venue_id,
        },
        headers=_auth(a_tok),
    )
    assert r.status_code == 422
