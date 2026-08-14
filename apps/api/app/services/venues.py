from __future__ import annotations

import logging
import math
import re
from datetime import datetime, timezone
from typing import Literal
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.venue import Venue
from app.schemas.venues import NearbyVenuesResponse, ProviderStatus, VenueResponse
from app.services import places as places_service

_log = logging.getLogger(__name__)

_EARTH_RADIUS_KM = 6371.0088

# Two venues with identical normalised names AND lat/lng within this
# distance count as duplicates during source="both" merge. 100 m
# tolerates Places-vs-seed coordinate drift (different geocoders pick
# different anchor points on the same property) without collapsing
# adjacent courts in a park.
_DEDUPE_PROXIMITY_KM = 0.1

# Stable namespace for synthesising deterministic UUIDs from Google
# Places identifiers. Persisted nowhere — the same place_id always
# produces the same UUID across processes / replicas / restarts, which
# matters for mobile client-side caching keyed on `venue.id`.
_PLACES_UUID_NAMESPACE = NAMESPACE_URL


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two lat/lng points in kilometers."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


_NAME_NORMALISE_RE = re.compile(r"[^a-z0-9]+")


def _normalise_name(name: str) -> str:
    """Lowercase, strip non-alphanumerics for fuzzy duplicate detection."""
    return _NAME_NORMALISE_RE.sub("", name.lower())


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
        source="seed",
        provider_place_id=None,
        attribution_required=False,
        # Seed rows are curated; assume the sport tag is correct.
        confidence="high",
    )


def _place_to_response(
    place: places_service.PlaceResult,
    requested_sport: str,
    distance_km: float | None,
) -> VenueResponse:
    """Synthesise a VenueResponse from a Places provider row.

    Places rows are NOT persisted — created_at/updated_at are stamped
    with "now" so the existing response shape is honoured without
    inventing a fake history. The UUID is derived from the place_id
    via uuid5 so the same place always serialises with the same id
    across requests and replicas.
    """
    now = datetime.now(timezone.utc)
    return VenueResponse(
        id=uuid5(_PLACES_UUID_NAMESPACE, f"places:{place.place_id}"),
        name=place.name,
        # We didn't ask Places for any sport hint and Google's `types`
        # list isn't a 1:1 of app sports. Echo the requested sport so
        # downstream clients keep the existing per-sport filtering
        # contract.
        sport_tags=[requested_sport],
        area=None,
        address=place.address,
        latitude=place.latitude,
        longitude=place.longitude,
        booking_url=None,
        notes=None,
        is_bookable=False,
        distance_km=round(distance_km, 2) if distance_km is not None else None,
        created_at=now,
        updated_at=now,
        source="google_places",
        provider_place_id=place.place_id,
        attribution_required=True,
        primary_type=place.primary_type,
        google_maps_uri=place.google_maps_uri,
        attributions=list(place.attributions),
        confidence=place.confidence,
    )


def _is_likely_duplicate_of_seed(
    place_name: str,
    place_lat: float,
    place_lng: float,
    seed_items: list[VenueResponse],
) -> bool:
    """Drop a Places row when a seed row matches by name + proximity.

    Seed rows win on dedupe — they carry curated metadata (booking_url,
    notes, is_bookable) that Places cannot supply. V1-safe: normalised
    name equality AND haversine distance ≤ _DEDUPE_PROXIMITY_KM.
    """
    needle = _normalise_name(place_name)
    if not needle:
        return False
    for seed in seed_items:
        if _normalise_name(seed.name) != needle:
            continue
        if _haversine_km(place_lat, place_lng, seed.latitude, seed.longitude) <= _DEDUPE_PROXIMITY_KM:
            return True
    return False


async def list_nearby_venues(
    db: AsyncSession,
    sport: str,
    lat: float | None,
    lng: float | None,
    radius_km: float = 10.0,
    limit: int = 20,
    source: Literal["seed", "places", "both"] = "seed",
    q: str | None = None,
    cursor: str | None = None,
) -> NearbyVenuesResponse:
    """
    Return venues that serve the requested sport.

    Sport filtering is done in Python because `sport_tags` is a JSON column
    (chosen for SQLite test compatibility); this is fine for a tens-of-rows
    catalog. If the catalog grows large, switch to a Postgres ARRAY column
    + GIN index and push the filter into SQL.

    Two coordinate modes:

    * **Coordinates supplied** (`lat` AND `lng`). Compute Haversine distance,
      drop venues outside ``radius_km``, sort by (distance ASC, name ASC) so
      ties are deterministic, then apply ``limit``. ``distance_km`` is
      populated. If no sport-matching venue is inside the radius the items
      list is empty — we do NOT fall back to the Sydney catalog, because
      that would silently mislead a caller who explicitly said "near me."
    * **No coordinates**. Preserve the existing catalog fallback: sport
      filter, alphabetical by name, ``limit`` applied. ``radius_km`` is
      ignored in this mode (radius without a centre is meaningless).

    Three source modes (v1.1):

    * ``source="seed"`` (default): exactly the v1.0 behaviour. No Places
      call, regardless of coords. Wire shape unchanged because the new
      response fields all default to seed values.
    * ``source="places"``: skip seed entirely and synthesise items from
      Google Places. Requires lat/lng — without coords there's no centre
      and Places can't be queried, so the response is an empty list (not
      a 4xx — the route stays soft). Provider failures (missing key,
      timeout, non-2xx) also collapse to empty.
    * ``source="both"``: seed first, then fill with Places candidates,
      deduplicating by normalised name + ≤100m proximity (seed wins so
      curated metadata is preserved). When lat/lng are absent this
      degrades to seed-only behaviour because Places cannot be called.

    ``total`` reflects the post-merge, post-dedup pre-limit count.

    Cursor pagination (Codex fix):

    A non-empty ``cursor`` is always a Google Places Text Search
    continuation token. Including the seed catalog again on every page
    would let already-loaded seed rows eat up the ``limit`` slots
    intended for the next Places page — the mobile picker would tap
    "Load more" and see no new venues even when Google had more to
    offer. So on a cursor request we skip the seed branch entirely:

    * ``source="seed"`` + cursor: ignored — cursor has no meaning for
      the static catalog. Behaves like the cursor-less seed request.
    * ``source="places"`` + cursor: Places continuation only (already
      worked, but pinned).
    * ``source="both"`` + cursor: treated as Places continuation only;
      no seed rows are returned on this page.

    First page (no cursor) keeps the merge behaviour described above.
    """
    has_coords = lat is not None and lng is not None
    is_cursor_page = source in ("places", "both") and bool(cursor)

    # ── Seed branch ─────────────────────────────────────────────────────
    seed_items: list[VenueResponse]
    seed_total: int
    # Skip the seed catalog on a cursor page so the mobile "Load more"
    # caller doesn't get the same seed rows repeatedly (and so the
    # ``limit`` slots go to the new Places page).
    if source in ("seed", "both") and not is_cursor_page:
        rows = (await db.execute(select(Venue))).scalars().all()
        matching = [v for v in rows if sport in (v.sport_tags or [])]

        if has_coords:
            scored = [(v, _haversine_km(lat, lng, v.latitude, v.longitude)) for v in matching]
            within = [(v, d) for (v, d) in scored if d <= radius_km]
            # (distance ASC, name ASC) — name is the deterministic
            # tie-breaker so equidistant venues return in stable
            # alphabetical order.
            within.sort(key=lambda pair: (pair[1], pair[0].name.lower()))
            seed_items = [_to_response(v, d) for (v, d) in within]
            seed_total = len(within)
        else:
            matching.sort(key=lambda v: v.name.lower())
            seed_items = [_to_response(v, None) for v in matching]
            seed_total = len(matching)
    else:
        seed_items = []
        seed_total = 0

    # ── Places branch ───────────────────────────────────────────────────
    place_items: list[VenueResponse] = []
    provider_status: ProviderStatus = "disabled"
    next_cursor: str | None = None

    if source in ("places", "both"):
        provider_status = "missing_coordinates" if not has_coords else "disabled"

    if source in ("places", "both") and has_coords:
        # Defence in depth — Stream 1's provider already fails closed,
        # but a second guard keeps any future regression contained to
        # the v1.0 seed path.
        try:
            places_result = await places_service.search_sport_places_v2(
                sport=sport,
                lat=lat,
                lng=lng,
                radius_km=radius_km,
                limit=limit,
                q=q,
                cursor=cursor,
            )
            provider_status = places_result.status
            next_cursor = places_result.next_page_token
            place_rows = places_result.results
        except Exception as exc:  # noqa: BLE001 — boundary guard
            _log.warning(
                "Places provider raised for sport=%s; falling back to seed only: %s",
                sport,
                exc,
            )
            provider_status = "error"
            place_rows = []

        # source="both": drop Places rows that look like a seed entry.
        # source="places": no seed to dedupe against, so trust Places.
        if source == "both":
            place_rows = [
                p for p in place_rows if not _is_likely_duplicate_of_seed(p.name, p.latitude, p.longitude, seed_items)
            ]

        for p in place_rows:
            d = _haversine_km(lat, lng, p.latitude, p.longitude)
            # Hard radius enforcement at the integration boundary.
            # Google Places searchText uses `locationBias` (a soft hint,
            # not a hard cap), and even searchNearby's `locationRestriction`
            # has bitten us with rows just over the line. The contract
            # of /venues/nearby is "within radius_km" — enforce it here
            # rather than trusting the provider so the same guarantee
            # holds for source=places and for the Places half of
            # source=both.
            if d > radius_km:
                continue
            place_items.append(_place_to_response(p, sport, d))

    # ── Merge / sort / limit ────────────────────────────────────────────
    if source == "seed":
        merged = seed_items
        total = seed_total
    elif source == "places":
        merged = place_items
        total = len(place_items)
    elif is_cursor_page:
        # source="both" cursor page: seed_items is empty by construction
        # above. Return only the continuation Places rows so the mobile
        # caller sees just the new page.
        merged = place_items
        total = len(place_items)
    else:  # "both", first page
        merged = seed_items + place_items
        total = len(merged)

    if has_coords:
        # Re-sort the combined list by (distance ASC, name ASC) so the
        # merge order doesn't surface seed-then-places as a visible
        # artifact when a Places row is genuinely the nearest.
        merged.sort(
            key=lambda v: (
                v.distance_km if v.distance_km is not None else math.inf,
                v.name.lower(),
            )
        )

    items = merged[:limit]
    return NearbyVenuesResponse(
        items=items,
        total=total,
        provider_status=provider_status,
        next_cursor=next_cursor,
    )


async def get_venue_or_404(db: AsyncSession, venue_id: UUID) -> Venue:
    venue = (await db.execute(select(Venue).where(Venue.id == venue_id))).scalar_one_or_none()
    if venue is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
    return venue
