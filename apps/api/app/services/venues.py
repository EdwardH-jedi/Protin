from __future__ import annotations

import math
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.venue import Venue
from app.schemas.venues import NearbyVenuesResponse, VenueResponse

_EARTH_RADIUS_KM = 6371.0088


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two lat/lng points in kilometers."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _to_response(venue: Venue, distance_km: float | None) -> VenueResponse:
    return VenueResponse(
        id=venue.id,
        name=venue.name,
        sport_tags=list(venue.sport_tags or []),
        area=venue.area,
        address=venue.address,
        latitude=venue.latitude,
        longitude=venue.longitude,
        booking_url=venue.booking_url,
        notes=venue.notes,
        is_bookable=venue.is_bookable,
        distance_km=round(distance_km, 2) if distance_km is not None else None,
        created_at=venue.created_at,
        updated_at=venue.updated_at,
    )


async def list_nearby_venues(
    db: AsyncSession,
    sport: str,
    lat: float | None,
    lng: float | None,
    limit: int = 20,
) -> NearbyVenuesResponse:
    """
    Return venues that serve the requested sport.

    Sport filtering is done in Python because `sport_tags` is a JSON column
    (chosen for SQLite test compatibility); this is fine for a tens-of-rows
    catalog. If the catalog grows large, switch to a Postgres ARRAY column
    + GIN index and push the filter into SQL.

    When lat/lng are supplied, results are sorted by distance ascending
    and `distance_km` is populated. When lat/lng are missing (the MVP
    mobile path while expo-location is not installed), results are sorted
    alphabetically by name and `distance_km` is None.
    """
    rows = (await db.execute(select(Venue))).scalars().all()

    matching = [v for v in rows if sport in (v.sport_tags or [])]

    if lat is not None and lng is not None:
        scored = [(v, _haversine_km(lat, lng, v.latitude, v.longitude)) for v in matching]
        scored.sort(key=lambda pair: pair[1])
        items = [_to_response(v, d) for (v, d) in scored[:limit]]
    else:
        matching.sort(key=lambda v: v.name.lower())
        items = [_to_response(v, None) for v in matching[:limit]]

    return NearbyVenuesResponse(items=items, total=len(matching))


async def get_venue_or_404(db: AsyncSession, venue_id: UUID) -> Venue:
    venue = (await db.execute(select(Venue).where(Venue.id == venue_id))).scalar_one_or_none()
    if venue is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
    return venue
