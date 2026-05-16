"""Venue endpoint + nearby ordering tests using in-memory SQLite."""

from __future__ import annotations

import json
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.services.places import PlaceResult

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
    """A query at Bondi (~-33.89, 151.27) should return Bondi venue first.

    Uses ``radius_km=50`` so all three seeded venues are inside the radius —
    this test pins distance-ascending sort, separately from the radius-cut
    behavior covered by the new tests below.
    """
    await _wipe_venues()
    await _seed_venue(name="Far", sport_tags=["running"], lat=-33.80, lng=151.00)  # Parramatta-ish
    await _seed_venue(name="Near", sport_tags=["running"], lat=-33.89, lng=151.27)  # Bondi
    await _seed_venue(name="Mid", sport_tags=["running"], lat=-33.88, lng=151.21)   # Surry Hills-ish

    token = await _register(client, "venue_sort@example.com")
    r = await client.get(
        "/venues/nearby",
        params={"sport": "running", "lat": -33.89, "lng": 151.27, "radius_km": 50},
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


# ---------------------------------------------------------------------------
# Radius filtering (Stream 2)
# ---------------------------------------------------------------------------


async def test_nearby_default_radius_excludes_far_venues(client: AsyncClient) -> None:
    """With coordinates and the default 10 km radius, Parramatta is dropped."""
    await _wipe_venues()
    await _seed_venue(name="Near", sport_tags=["running"], lat=-33.89, lng=151.27)  # Bondi
    await _seed_venue(name="Mid", sport_tags=["running"], lat=-33.88, lng=151.21)   # ~5.7 km
    await _seed_venue(name="Far", sport_tags=["running"], lat=-33.80, lng=151.00)   # ~27 km

    token = await _register(client, "venue_default_radius@example.com")
    r = await client.get(
        "/venues/nearby",
        params={"sport": "running", "lat": -33.89, "lng": 151.27},
        headers=_auth(token),
    )
    assert r.status_code == 200
    body = r.json()
    names = [v["name"] for v in body["items"]]
    assert names == ["Near", "Mid"]
    # total reflects the post-radius count, matching the items length when
    # the radius cut is the binding constraint (not limit).
    assert body["total"] == 2


async def test_nearby_larger_radius_includes_far_venue(client: AsyncClient) -> None:
    """Bumping radius back up brings Parramatta back into the result set."""
    await _wipe_venues()
    await _seed_venue(name="Near", sport_tags=["running"], lat=-33.89, lng=151.27)
    await _seed_venue(name="Far", sport_tags=["running"], lat=-33.80, lng=151.00)

    token = await _register(client, "venue_large_radius@example.com")
    r = await client.get(
        "/venues/nearby",
        params={
            "sport": "running",
            "lat": -33.89,
            "lng": 151.27,
            "radius_km": 50,
        },
        headers=_auth(token),
    )
    assert r.status_code == 200
    names = [v["name"] for v in r.json()["items"]]
    assert names == ["Near", "Far"]


async def test_nearby_radius_boundary_50_includes_50km_venue(client: AsyncClient) -> None:
    """radius_km=50 (upper bound) is accepted and returns results."""
    await _wipe_venues()
    await _seed_venue(name="Bondi", sport_tags=["tennis"], lat=-33.89, lng=151.27)

    token = await _register(client, "venue_radius_boundary@example.com")
    r = await client.get(
        "/venues/nearby",
        params={
            "sport": "tennis",
            "lat": -33.89,
            "lng": 151.27,
            "radius_km": 50,
        },
        headers=_auth(token),
    )
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1


async def test_nearby_radius_below_minimum_returns_422(client: AsyncClient) -> None:
    token = await _register(client, "venue_radius_too_small@example.com")
    r = await client.get(
        "/venues/nearby",
        params={
            "sport": "tennis",
            "lat": -33.89,
            "lng": 151.27,
            "radius_km": 0.5,
        },
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_nearby_radius_above_maximum_returns_422(client: AsyncClient) -> None:
    token = await _register(client, "venue_radius_too_big@example.com")
    r = await client.get(
        "/venues/nearby",
        params={
            "sport": "tennis",
            "lat": -33.89,
            "lng": 151.27,
            "radius_km": 51,
        },
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_nearby_no_coords_ignores_radius_km(client: AsyncClient) -> None:
    """A radius without a centre is meaningless — fall through to catalog."""
    await _wipe_venues()
    # Three gym venues, none of which would survive any plausible radius —
    # but the catalog path doesn't apply distance at all, so all three come
    # back alphabetically regardless of the radius_km query value.
    await _seed_venue(name="Charlie", sport_tags=["gym"], lat=-33.89, lng=151.22)
    await _seed_venue(name="Alpha", sport_tags=["gym"], lat=-33.90, lng=151.23)
    await _seed_venue(name="Bravo", sport_tags=["gym"], lat=-33.88, lng=151.21)

    token = await _register(client, "venue_nocoord_radius@example.com")
    r = await client.get(
        "/venues/nearby",
        params={"sport": "gym", "radius_km": 20},
        headers=_auth(token),
    )
    assert r.status_code == 200
    body = r.json()
    names = [v["name"] for v in body["items"]]
    assert names == ["Alpha", "Bravo", "Charlie"]
    # distance_km stays None in catalog mode regardless of radius_km value.
    assert all(v["distance_km"] is None for v in body["items"])


async def test_nearby_zero_inside_radius_returns_empty_not_catalog(client: AsyncClient) -> None:
    """Coords supplied but nothing inside radius → empty, NOT a catalog fallback."""
    await _wipe_venues()
    # Seed two venues both ~hundreds of km away from the query point. With
    # the maximum radius of 50 km, both must be excluded — the response
    # must NOT silently switch to alphabetical catalog mode.
    await _seed_venue(name="Faraway A", sport_tags=["tennis"], lat=-37.81, lng=144.96)  # Melbourne
    await _seed_venue(name="Faraway B", sport_tags=["tennis"], lat=-27.47, lng=153.03)  # Brisbane

    token = await _register(client, "venue_empty_radius@example.com")
    r = await client.get(
        "/venues/nearby",
        params={
            "sport": "tennis",
            "lat": -33.89,
            "lng": 151.27,
            "radius_km": 50,
        },
        headers=_auth(token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


async def test_nearby_sport_filter_still_applies_with_radius(client: AsyncClient) -> None:
    """Sport filter runs before radius — a near golf venue is excluded for a tennis query."""
    await _wipe_venues()
    await _seed_venue(name="Tennis OK", sport_tags=["tennis"], lat=-33.89, lng=151.27)
    await _seed_venue(name="Golf Right Here", sport_tags=["golf"], lat=-33.89, lng=151.27)

    token = await _register(client, "venue_sport_with_radius@example.com")
    r = await client.get(
        "/venues/nearby",
        params={"sport": "tennis", "lat": -33.89, "lng": 151.27},
        headers=_auth(token),
    )
    assert r.status_code == 200
    names = [v["name"] for v in r.json()["items"]]
    assert names == ["Tennis OK"]


async def test_nearby_equidistant_venues_break_tie_alphabetically(client: AsyncClient) -> None:
    """Two equidistant venues come back in alphabetical name order."""
    await _wipe_venues()
    # Query at (0, 0); seed two venues mirrored on the equator. Haversine
    # distance is symmetric, so both are ~1.11 km away.
    await _seed_venue(name="Zulu", sport_tags=["tennis"], lat=0.01, lng=0.0)
    await _seed_venue(name="Alpha", sport_tags=["tennis"], lat=-0.01, lng=0.0)

    token = await _register(client, "venue_tie@example.com")
    r = await client.get(
        "/venues/nearby",
        params={"sport": "tennis", "lat": 0.0, "lng": 0.0},
        headers=_auth(token),
    )
    assert r.status_code == 200
    items = r.json()["items"]
    # Same distance up to rounding; alphabetical name resolves the tie.
    assert [v["name"] for v in items] == ["Alpha", "Zulu"]


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


# ---------------------------------------------------------------------------
# Seed dataset quality (apps/api/data/venues_sydney.json)
#
# These tests inspect the JSON file directly — no DB, no auth, no ASGI
# fixtures — so they run in milliseconds and stay isolated from the
# module-scoped engine fixture above.
# ---------------------------------------------------------------------------


_SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "venues_sydney.json"

# Whitelist comes from the app's controlled vocabulary
# (app/schemas/venues.py:9). Keep it in sync when new sports are added.
_SUPPORTED_SPORTS = {"gym", "golf", "tennis", "running"}

# Greater Sydney bounding box. Liberal enough to cover Parramatta /
# North Ryde / Bondi without admitting nonsense like a swapped 0,0.
_SYDNEY_LAT_RANGE = (-34.2, -33.5)
_SYDNEY_LNG_RANGE = (150.8, 151.4)


def _load_seed() -> list[dict]:
    return json.loads(_SEED_PATH.read_text(encoding="utf-8"))


def test_seed_file_exists_and_is_non_empty() -> None:
    data = _load_seed()
    assert isinstance(data, list)
    assert len(data) > 0


def test_seed_every_venue_has_required_geo_fields() -> None:
    for v in _load_seed():
        assert "name" in v and isinstance(v["name"], str) and v["name"].strip(), v
        assert "latitude" in v and isinstance(v["latitude"], (int, float)), v
        assert "longitude" in v and isinstance(v["longitude"], (int, float)), v


def test_seed_coordinates_are_inside_greater_sydney() -> None:
    for v in _load_seed():
        assert _SYDNEY_LAT_RANGE[0] <= v["latitude"] <= _SYDNEY_LAT_RANGE[1], v
        assert _SYDNEY_LNG_RANGE[0] <= v["longitude"] <= _SYDNEY_LNG_RANGE[1], v


def test_seed_sport_tags_are_non_empty_and_supported() -> None:
    for v in _load_seed():
        tags = v.get("sport_tags")
        assert isinstance(tags, list) and tags, v
        for tag in tags:
            assert tag in _SUPPORTED_SPORTS, f"{v['name']}: unsupported tag {tag!r}"


def test_seed_names_are_unique() -> None:
    names = [v["name"] for v in _load_seed()]
    duplicates = sorted({n for n in names if names.count(n) > 1})
    assert duplicates == [], f"duplicate venue names: {duplicates}"


def test_seed_no_unsupported_top_level_fields() -> None:
    """Catch typos / stale schema fields like 'suburb' or 'source_url'."""
    allowed = {
        "name",
        "sport_tags",
        "area",
        "address",
        "latitude",
        "longitude",
        "booking_url",
        "is_bookable",
        "notes",
    }
    for v in _load_seed():
        unexpected = set(v.keys()) - allowed
        assert unexpected == set(), f"{v['name']}: unsupported fields {unexpected}"


def test_seed_newtown_adjacent_launch_coverage_present() -> None:
    """Stream 3 goal — anchor venues in the belt around Newtown.

    The Perplexity research dataset intentionally does NOT include a
    venue with ``area == "Newtown"``: there is no source-verified public
    sports facility whose civic address is literally Newtown 2042 that
    we can pin to exact coordinates. Instead, V1 launch coverage is
    achieved through Newtown-adjacent suburbs (Camperdown / Alexandria /
    St Peters to the south and east, Annandale / Glebe to the west and
    north, Marrickville further south). An exact-Newtown venue should
    only be added later once a source + coordinates are verified — do
    NOT invent one to satisfy this test.
    """
    areas = {v.get("area") for v in _load_seed()}
    assert "Camperdown" in areas, "missing Camperdown coverage"
    assert {"Alexandria", "St Peters"} & areas, "missing Alexandria/St Peters coverage"
    assert {"Annandale", "Glebe"} & areas, "missing Annandale/Glebe coverage"
    assert "Marrickville" in areas, "missing Marrickville coverage"


def test_seed_tennis_coverage_in_inner_west_or_usyd() -> None:
    """At least one tennis venue should sit in the new Inner West / USYD belt."""
    inner_west_or_usyd = {"Camperdown", "Alexandria", "Marrickville"}
    tennis_in_belt = [
        v for v in _load_seed()
        if "tennis" in v.get("sport_tags", []) and v.get("area") in inner_west_or_usyd
    ]
    assert tennis_in_belt, "no tennis venue in Camperdown/Alexandria/Marrickville"


# ---------------------------------------------------------------------------
# Remaining HTTP tests
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Stream 2 — /venues/nearby `source` parameter (seed | places | both)
# ---------------------------------------------------------------------------
#
# The Places provider is mocked at the module import location used by the
# venues service (``app.services.venues.places_service``) so no real
# httpx calls happen here — same pattern Stream 1's test_places.py uses
# but lifted up to the integration boundary.


def _place(
    *,
    place_id: str = "places/ChIJabc",
    name: str = "Mock Court",
    lat: float = -33.89,
    lng: float = 151.27,
    address: str = "1 Mock St, Sydney NSW",
    types: tuple[str, ...] = ("sports_complex",),
) -> PlaceResult:
    return PlaceResult(
        place_id=place_id,
        name=name,
        latitude=lat,
        longitude=lng,
        address=address,
        types=types,
    )


async def test_source_default_is_seed_and_does_not_call_places(
    client: AsyncClient,
) -> None:
    """Default request shape (no ``source`` query param) is the v1.0 wire
    contract: seed-only, no Places call."""
    await _wipe_venues()
    await _seed_venue(name="Seed Court", sport_tags=["tennis"], lat=-33.89, lng=151.27)

    token = await _register(client, "venue_source_default@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(return_value=[]),
    ) as mock_places:
        r = await client.get(
            "/venues/nearby",
            params={"sport": "tennis", "lat": -33.89, "lng": 151.27},
            headers=_auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert [v["name"] for v in body["items"]] == ["Seed Court"]
    # Every v1.0 item is now stamped source="seed" via the additive field.
    assert body["items"][0]["source"] == "seed"
    assert body["items"][0]["attribution_required"] is False
    assert body["items"][0]["provider_place_id"] is None
    mock_places.assert_not_called()


async def test_source_seed_explicit_skips_places_provider(client: AsyncClient) -> None:
    await _wipe_venues()
    await _seed_venue(name="Seed Court", sport_tags=["tennis"], lat=-33.89, lng=151.27)

    token = await _register(client, "venue_source_seed@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(return_value=[_place(name="Should-not-appear")]),
    ) as mock_places:
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "source": "seed",
            },
            headers=_auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert [v["name"] for v in body["items"]] == ["Seed Court"]
    mock_places.assert_not_called()


async def test_source_places_empty_provider_returns_200_empty_not_500(
    client: AsyncClient,
) -> None:
    """Missing API key / quota error path: provider returns [] and the
    endpoint stays 200 with an empty list — never 5xx."""
    await _wipe_venues()
    await _seed_venue(name="Seed Court", sport_tags=["tennis"], lat=-33.89, lng=151.27)

    token = await _register(client, "venue_places_empty@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(return_value=[]),
    ):
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "source": "places",
            },
            headers=_auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


async def test_source_places_with_mocked_provider_returns_normalized_rows(
    client: AsyncClient,
) -> None:
    await _wipe_venues()
    # Seed a row that source=places must IGNORE entirely.
    await _seed_venue(
        name="Should Stay Hidden", sport_tags=["tennis"], lat=-33.89, lng=151.27
    )

    token = await _register(client, "venue_places_mock@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(
            return_value=[
                _place(
                    place_id="places/PROV-1",
                    name="Newtown Tennis Centre",
                    lat=-33.895,
                    lng=151.18,
                    address="Newtown NSW",
                ),
            ]
        ),
    ) as mock_places:
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "source": "places",
            },
            headers=_auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    # Seed is excluded — only Places rows in source=places.
    assert [v["name"] for v in body["items"]] == ["Newtown Tennis Centre"]
    item = body["items"][0]
    assert item["source"] == "google_places"
    assert item["provider_place_id"] == "places/PROV-1"
    assert item["attribution_required"] is True
    # distance_km computed from query (-33.89, 151.27) → (-33.895, 151.18)
    assert item["distance_km"] is not None
    # The synthetic id is a deterministic UUID5 — never empty.
    assert isinstance(item["id"], str) and len(item["id"]) > 0
    # Provider was called exactly once with the user's coords.
    mock_places.assert_awaited_once()
    kwargs = mock_places.await_args.kwargs
    assert kwargs["sport"] == "tennis"
    assert kwargs["lat"] == -33.89
    assert kwargs["lng"] == 151.27


async def test_source_places_response_exposes_no_raw_google_fields(
    client: AsyncClient,
) -> None:
    """Wire-side contract: the public response must never leak raw Google
    JSON keys (``displayName``, ``formattedAddress``, ``types``, ...).
    ``PlaceResult`` + ``VenueResponse`` enforce this internally — this
    test pins the contract from the HTTP boundary so a future schema
    widening cannot accidentally re-expose them.
    """
    await _wipe_venues()
    token = await _register(client, "venue_places_no_raw@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(
            return_value=[
                _place(
                    place_id="places/SHAPE",
                    name="Shape Court",
                    lat=-33.892,
                    lng=151.272,
                    types=("sports_complex", "tennis_court"),
                ),
            ]
        ),
    ):
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "source": "places",
            },
            headers=_auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["items"], "expected one places-sourced item"
    item = body["items"][0]
    # Allowed keys mirror VenueResponse (apps/api/app/schemas/venues.py).
    allowed = {
        "id", "name", "sport_tags", "area", "address", "latitude",
        "longitude", "booking_url", "notes", "is_bookable", "distance_km",
        "created_at", "updated_at", "source", "provider_place_id",
        "attribution_required",
    }
    leaked = set(item.keys()) - allowed
    assert leaked == set(), f"unexpected fields on the wire: {leaked}"
    for forbidden in (
        "displayName",
        "formattedAddress",
        "shortFormattedAddress",
        "types",
        "place_id",
        "rating",
        "userRatingCount",
    ):
        assert forbidden not in item, f"raw Google field leaked: {forbidden}"


async def test_source_both_merges_seed_and_places(client: AsyncClient) -> None:
    await _wipe_venues()
    await _seed_venue(name="Seed Court", sport_tags=["tennis"], lat=-33.89, lng=151.27)

    token = await _register(client, "venue_both_merge@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(
            return_value=[
                _place(place_id="places/A", name="Places Court A", lat=-33.90, lng=151.25),
                _place(place_id="places/B", name="Places Court B", lat=-33.92, lng=151.20),
            ]
        ),
    ):
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "source": "both",
                "radius_km": 50,
            },
            headers=_auth(token),
        )
    assert r.status_code == 200
    items = r.json()["items"]
    names = sorted(v["name"] for v in items)
    assert names == ["Places Court A", "Places Court B", "Seed Court"]

    by_source = {v["name"]: v["source"] for v in items}
    assert by_source["Seed Court"] == "seed"
    assert by_source["Places Court A"] == "google_places"
    assert by_source["Places Court B"] == "google_places"


async def test_source_both_falls_back_to_seed_when_provider_raises(
    client: AsyncClient,
) -> None:
    """Defense-in-depth: even if Stream 1's provider regresses and starts
    raising, the venues service swallows the exception and the seed
    response is preserved."""
    await _wipe_venues()
    await _seed_venue(name="Seed Court", sport_tags=["tennis"], lat=-33.89, lng=151.27)

    token = await _register(client, "venue_both_fallback@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(side_effect=RuntimeError("upstream exploded")),
    ):
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "source": "both",
            },
            headers=_auth(token),
        )
    assert r.status_code == 200
    items = r.json()["items"]
    assert [v["name"] for v in items] == ["Seed Court"]
    assert items[0]["source"] == "seed"


async def test_source_both_dedupes_places_matching_seed_by_name_and_proximity(
    client: AsyncClient,
) -> None:
    """A Places row with the same (normalised) name and within ~100m of a
    seed row is dropped — seed wins on dedupe so curated metadata
    (booking_url, notes, is_bookable) survives."""
    await _wipe_venues()
    await _seed_venue(
        name="Newtown Tennis Centre",
        sport_tags=["tennis"],
        lat=-33.8950,
        lng=151.1800,
        booking_url="https://example.com/book",
        is_bookable=True,
    )

    token = await _register(client, "venue_both_dedupe@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(
            return_value=[
                # ~50m away from the seed row, same name with punctuation
                # difference → should be deduped.
                _place(
                    place_id="places/DUPE",
                    name="newtown tennis centre!",
                    lat=-33.8954,
                    lng=151.1800,
                ),
                # Same name but 2km away → NOT deduped (different
                # branch / different property).
                _place(
                    place_id="places/FAR",
                    name="Newtown Tennis Centre",
                    lat=-33.875,
                    lng=151.20,
                ),
            ]
        ),
    ):
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "source": "both",
                "radius_km": 50,
            },
            headers=_auth(token),
        )
    assert r.status_code == 200
    items = r.json()["items"]
    provider_ids = {v["provider_place_id"] for v in items}
    # Dupe Places row was suppressed; the far branch and the seed row both survive.
    assert "places/DUPE" not in provider_ids
    assert "places/FAR" in provider_ids
    # Seed wins on dedupe — the booking_url survives, proving the seed
    # row (not the synthetic Places one) is what's in the response.
    seed = next(v for v in items if v["source"] == "seed")
    assert seed["booking_url"] == "https://example.com/book"
    assert seed["is_bookable"] is True


async def test_source_both_applies_limit_after_merge(client: AsyncClient) -> None:
    await _wipe_venues()
    # 3 seed rows + 3 places rows = 6 total candidates pre-limit.
    await _seed_venue(name="Seed A", sport_tags=["tennis"], lat=-33.890, lng=151.270)
    await _seed_venue(name="Seed B", sport_tags=["tennis"], lat=-33.891, lng=151.271)
    await _seed_venue(name="Seed C", sport_tags=["tennis"], lat=-33.892, lng=151.272)

    token = await _register(client, "venue_both_limit@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(
            return_value=[
                _place(place_id="places/P1", name="Places P1", lat=-33.893, lng=151.273),
                _place(place_id="places/P2", name="Places P2", lat=-33.894, lng=151.274),
                _place(place_id="places/P3", name="Places P3", lat=-33.895, lng=151.275),
            ]
        ),
    ):
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "source": "both",
                "limit": 4,
                "radius_km": 50,
            },
            headers=_auth(token),
        )
    body = r.json()
    assert len(body["items"]) == 4
    # total reflects post-merge / post-dedupe pre-limit count.
    assert body["total"] == 6


async def test_source_both_sorts_by_distance_across_seed_and_places(
    client: AsyncClient,
) -> None:
    """Stream-2 requirement: a Places row that is genuinely the nearest
    must not be pushed behind a farther seed row just because of
    merge order."""
    await _wipe_venues()
    # Two seed rows: 1km away and 5km away from the query origin.
    await _seed_venue(name="Seed Far", sport_tags=["tennis"], lat=-33.93, lng=151.27)
    await _seed_venue(name="Seed Mid", sport_tags=["tennis"], lat=-33.90, lng=151.27)

    token = await _register(client, "venue_both_sort@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(
            return_value=[
                # Right next to the query origin → should sort FIRST.
                _place(place_id="places/NEAREST", name="Places Nearest", lat=-33.891, lng=151.271),
            ]
        ),
    ):
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "source": "both",
                "radius_km": 50,
            },
            headers=_auth(token),
        )
    names = [v["name"] for v in r.json()["items"]]
    assert names[0] == "Places Nearest"
    # Distances are monotonically non-decreasing.
    distances = [v["distance_km"] for v in r.json()["items"]]
    assert distances == sorted(distances)


async def test_invalid_source_returns_422(client: AsyncClient) -> None:
    token = await _register(client, "venue_invalid_source@example.com")
    r = await client.get(
        "/venues/nearby",
        params={"sport": "tennis", "source": "garbage"},
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_source_both_without_coords_falls_back_to_seed_catalog(
    client: AsyncClient,
) -> None:
    """No lat/lng → Places cannot be queried. ``source=both`` must
    degrade silently to seed-only catalog behaviour AND must not call
    the provider."""
    await _wipe_venues()
    await _seed_venue(name="Alpha", sport_tags=["gym"], lat=-33.89, lng=151.22)
    await _seed_venue(name="Bravo", sport_tags=["gym"], lat=-33.88, lng=151.21)

    token = await _register(client, "venue_both_nocoords@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(return_value=[_place(name="Should-not-appear")]),
    ) as mock_places:
        r = await client.get(
            "/venues/nearby",
            params={"sport": "gym", "source": "both"},
            headers=_auth(token),
        )
    assert r.status_code == 200
    names = [v["name"] for v in r.json()["items"]]
    assert names == ["Alpha", "Bravo"]
    mock_places.assert_not_called()


async def test_source_places_excludes_places_outside_radius_km(
    client: AsyncClient,
) -> None:
    """Places provider returns by `locationBias` / `locationRestriction`
    which Google treats as a soft hint, not a hard cap. The integration
    layer must enforce the documented ``radius_km`` contract — Codex
    BLOCK fix.
    """
    await _wipe_venues()
    token = await _register(client, "venue_places_radius@example.com")

    # Query origin: Sydney CBD. radius_km=5 makes the in/out distinction
    # unambiguous: ~1.1 km vs ~7.8 km from origin.
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(
            return_value=[
                _place(
                    place_id="places/IN",
                    name="In-Radius Court",
                    lat=-33.88,
                    lng=151.27,
                ),  # ~1.1 km from (-33.89, 151.27)
                _place(
                    place_id="places/OUT",
                    name="Way Too Far Court",
                    lat=-33.96,
                    lng=151.27,
                ),  # ~7.8 km — outside the 5 km cap
            ]
        ),
    ):
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "radius_km": 5,
                "source": "places",
            },
            headers=_auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    provider_ids = {v["provider_place_id"] for v in body["items"]}
    assert "places/IN" in provider_ids
    assert "places/OUT" not in provider_ids
    # total reflects the post-radius pre-limit count.
    assert body["total"] == 1
    assert all(v["distance_km"] <= 5 for v in body["items"])


async def test_source_both_excludes_places_outside_radius_km_but_keeps_seed(
    client: AsyncClient,
) -> None:
    """Codex BLOCK fix — verify the radius enforcement applies to the
    Places half of source=both without affecting the seed half. The
    in-radius seed row must still surface."""
    await _wipe_venues()
    # Seed row ~1.1 km north of the query origin → inside the 5 km cap.
    await _seed_venue(
        name="In-Radius Seed",
        sport_tags=["tennis"],
        lat=-33.88,
        lng=151.27,
    )

    token = await _register(client, "venue_both_radius_outside@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(
            return_value=[
                _place(
                    place_id="places/FAR",
                    name="Way Too Far Court",
                    lat=-33.96,
                    lng=151.27,
                ),  # ~7.8 km from origin — outside the 5 km cap
            ]
        ),
    ):
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "radius_km": 5,
                "source": "both",
            },
            headers=_auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    names = [v["name"] for v in body["items"]]
    provider_ids = {v["provider_place_id"] for v in body["items"]}
    assert names == ["In-Radius Seed"]
    assert "places/FAR" not in provider_ids
    # post-radius pre-limit count is just the seed row.
    assert body["total"] == 1


async def test_source_both_includes_in_radius_places_with_tight_radius(
    client: AsyncClient,
) -> None:
    """Positive companion to the two negative-filter tests — the radius
    guard must NOT over-prune in-radius Places rows. Anchors the filter
    on the right side of the distance comparison."""
    await _wipe_venues()
    await _seed_venue(
        name="Seed Anchor",
        sport_tags=["tennis"],
        lat=-33.890,
        lng=151.270,
    )

    token = await _register(client, "venue_both_radius_inside@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(
            return_value=[
                _place(
                    place_id="places/CLOSE",
                    name="Right Next Door",
                    lat=-33.892,
                    lng=151.272,
                ),  # ~280 m from origin — well inside 5 km
            ]
        ),
    ):
        r = await client.get(
            "/venues/nearby",
            params={
                "sport": "tennis",
                "lat": -33.89,
                "lng": 151.27,
                "radius_km": 5,
                "source": "both",
            },
            headers=_auth(token),
        )
    body = r.json()
    provider_ids = {v["provider_place_id"] for v in body["items"]}
    assert "places/CLOSE" in provider_ids
    assert body["total"] == 2  # seed + in-radius places


async def test_source_places_without_coords_returns_empty_not_error(
    client: AsyncClient,
) -> None:
    """No coords with ``source=places`` is the "no centre to query"
    case — return 200 empty, not 422. Keeps the route soft so a mobile
    client that hasn't resolved location yet doesn't crash on the
    request."""
    await _wipe_venues()
    await _seed_venue(name="Seed Court", sport_tags=["tennis"], lat=-33.89, lng=151.27)

    token = await _register(client, "venue_places_nocoords@example.com")
    with patch(
        "app.services.venues.places_service.search_sport_places",
        new=AsyncMock(return_value=[_place(name="Should-not-appear")]),
    ) as mock_places:
        r = await client.get(
            "/venues/nearby",
            params={"sport": "tennis", "source": "places"},
            headers=_auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0
    mock_places.assert_not_called()
