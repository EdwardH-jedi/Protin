"""Google Places (New) provider for venue discovery.

v1.1 introduces a "Google-Maps-like" venue picker layer on top of the
existing local Sydney seed catalog. This module is the *foundation* for
that layer — Stream 1. It exposes a single async entry point,
``search_sport_places``, that:

* maps the app's sport identifiers to either a Places **type** (when a
  well-known one exists, e.g. ``golf_course`` / ``gym``) or a Places
  **text query** (everything else — basketball, tennis, badminton,
  soccer/football, running);
* calls the matching Places API (New) endpoint —
  ``places:searchNearby`` for type-based queries and
  ``places:searchText`` for keyword queries —
  with a tight field mask so we only pay for fields the picker can
  render;
* normalises the response into ``PlaceResult`` objects (no raw Google
  JSON leaks past this module);
* caches results in-process for 24h, keyed by sport + rounded coords +
  radius, so a stable QA location doesn't burn quota; and
* fails *closed*: missing API key, timeout, non-2xx, malformed JSON, or
  any unexpected exception → ``[]``. Callers therefore never need to
  branch on Places availability — the local seed continues to drive
  the picker when Places is silent.

This module deliberately does **not** persist results, does not touch
the ``Venue`` table, and does not modify the existing
``/venues/nearby`` contract. Those land in Stream 2.
"""

from __future__ import annotations

import logging
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import get_settings

_log = logging.getLogger(__name__)

# ─── Endpoints + headers ─────────────────────────────────────────────────────

_PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
_PLACES_TEXT_URL = "https://places.googleapis.com/v1/places:searchText"

# Minimal field mask — only the fields the mobile picker can render today.
# Heavier fields (regularOpeningHours, photos, userRatingCount, reviews,
# priceLevel, …) are intentionally excluded; each one moves the request
# into a more expensive Places SKU. Keep this list pinned and tested.
_FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.location",
        "places.formattedAddress",
        "places.shortFormattedAddress",
        "places.types",
    ]
)

_DEFAULT_TIMEOUT_SECONDS = 10.0
# Google Places caps `radius` at 50,000 m on both searchNearby and
# searchText — mirrors the existing /venues/nearby `le=50.0` upper bound.
_PLACES_MAX_RADIUS_M = 50_000
_DEFAULT_RADIUS_KM = 10.0
_DEFAULT_LIMIT = 20
# Places "New" hard-caps maxResultCount at 20 per request; respect it
# silently rather than letting Google reject the body.
_PLACES_MAX_RESULT_COUNT = 20


# ─── Sport → query mapping ───────────────────────────────────────────────────
#
# A sport entry is exactly one of:
#   * ``{"included_types": [...]}``   →  searchNearby
#   * ``{"text_query": "..."}``       →  searchText
#
# Tennis / basketball / badminton / soccer do not have dedicated Places
# types in the New API, so text search with a sport-specific phrase is
# the only path to useful density. Golf and gym do have types, so we
# use those (cheaper, no language ambiguity). Football is aliased onto
# the soccer text query to keep the picker honest for hosts who type
# either word.
_SPORT_QUERIES: dict[str, dict[str, Any]] = {
    "tennis": {"text_query": "tennis court"},
    "basketball": {"text_query": "basketball court"},
    "badminton": {"text_query": "badminton court"},
    "soccer": {"text_query": "soccer field"},
    "football": {"text_query": "soccer field"},
    "golf": {"included_types": ["golf_course"]},
    "running": {"text_query": "running track"},
    "gym": {"included_types": ["gym"]},
}


# ─── Internal normalised shape ───────────────────────────────────────────────


@dataclass(frozen=True)
class PlaceResult:
    """Normalised Places row. Stable shape — no raw Google JSON leaks."""

    place_id: str
    name: str
    latitude: float
    longitude: float
    address: str | None
    types: tuple[str, ...]


# ─── In-process TTL cache ────────────────────────────────────────────────────
#
# In-process is sufficient for Stream 1 — Places quota and pricing care
# about request *uniqueness*, and a 24h TTL keyed on a 2 d.p. rounded
# coord + sport + radius collapses most QA-scale traffic to a single
# upstream call per (sport, suburb). If we later need cross-instance
# sharing in production, swap to Redis behind the same get/put helpers.

_CACHE_TTL_SECONDS = 24 * 3600
_CACHE_MAX_ENTRIES = 256


@dataclass
class _CacheEntry:
    expires_at: float
    results: list[PlaceResult]


_CACHE: "OrderedDict[tuple[str, float, float, float], _CacheEntry]" = OrderedDict()


def _cache_key(
    *, sport: str, lat: float, lng: float, radius_km: float
) -> tuple[str, float, float, float]:
    # 2 d.p. on lat/lng ≈ 1.1 km at Sydney latitude. Two QA testers half
    # a block apart deliberately share a cache entry — exactly what we
    # want for quota containment. Round radius to 1 d.p. so callers
    # passing 9.9999 vs 10.0 don't fragment the cache.
    return (sport.lower(), round(lat, 2), round(lng, 2), round(radius_km, 1))


def _cache_get(
    key: tuple[str, float, float, float],
) -> list[PlaceResult] | None:
    entry = _CACHE.get(key)
    if entry is None:
        return None
    if entry.expires_at <= time.monotonic():
        _CACHE.pop(key, None)
        return None
    # Touch ordering so FIFO eviction keeps the hot set warm.
    _CACHE.move_to_end(key)
    return entry.results


def _cache_put(
    key: tuple[str, float, float, float], results: list[PlaceResult]
) -> None:
    _CACHE[key] = _CacheEntry(
        expires_at=time.monotonic() + _CACHE_TTL_SECONDS,
        results=results,
    )
    _CACHE.move_to_end(key)
    while len(_CACHE) > _CACHE_MAX_ENTRIES:
        _CACHE.popitem(last=False)


def _reset_cache() -> None:
    """Test hook — clear the module-level cache between cases."""
    _CACHE.clear()


# ─── Public entry point ──────────────────────────────────────────────────────


async def search_sport_places(
    *,
    sport: str,
    lat: float,
    lng: float,
    radius_km: float = _DEFAULT_RADIUS_KM,
    limit: int = _DEFAULT_LIMIT,
    api_key: str | None = None,
    http_client: httpx.AsyncClient | None = None,
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS,
) -> list[PlaceResult]:
    """Look up venues for ``sport`` near ``(lat, lng)`` via Google Places.

    Returns ``[]`` (never raises) on any of:
      * missing API key
      * unknown sport
      * upstream timeout / non-2xx / malformed JSON
      * any unexpected exception

    The API-key short-circuit runs *before* the cache lookup so a test
    or environment without a key never reads stale results from a
    previous configuration.
    """
    effective_key = api_key if api_key is not None else get_settings().google_places_api_key
    if not effective_key:
        return []

    sport_lower = sport.lower()
    query = _SPORT_QUERIES.get(sport_lower)
    if query is None:
        return []

    cache_key = _cache_key(
        sport=sport_lower, lat=lat, lng=lng, radius_km=radius_km
    )
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    radius_m = min(int(round(radius_km * 1000)), _PLACES_MAX_RADIUS_M)
    max_results = max(1, min(limit, _PLACES_MAX_RESULT_COUNT))

    if "included_types" in query:
        url = _PLACES_NEARBY_URL
        body: dict[str, Any] = {
            "includedTypes": query["included_types"],
            "maxResultCount": max_results,
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lng},
                    "radius": radius_m,
                },
            },
        }
    else:
        url = _PLACES_TEXT_URL
        body = {
            "textQuery": query["text_query"],
            "maxResultCount": max_results,
            "locationBias": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lng},
                    "radius": radius_m,
                },
            },
        }

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": effective_key,
        "X-Goog-FieldMask": _FIELD_MASK,
    }

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=timeout_seconds)
    try:
        try:
            response = await client.post(url, json=body, headers=headers)
        except httpx.TimeoutException:
            _log.warning("Google Places request timed out (sport=%s)", sport_lower)
            _cache_put(cache_key, [])
            return []
        except httpx.HTTPError as exc:
            _log.warning(
                "Google Places transport error (sport=%s): %s", sport_lower, exc
            )
            _cache_put(cache_key, [])
            return []
        except Exception as exc:  # defensive — provider must never raise
            _log.warning(
                "Google Places unexpected error (sport=%s): %s", sport_lower, exc
            )
            _cache_put(cache_key, [])
            return []
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code != 200:
        _log.warning(
            "Google Places non-200 (sport=%s status=%s)",
            sport_lower,
            response.status_code,
        )
        _cache_put(cache_key, [])
        return []

    try:
        payload = response.json()
    except ValueError:
        _log.warning("Google Places returned non-JSON body (sport=%s)", sport_lower)
        _cache_put(cache_key, [])
        return []

    results = _normalize_places_payload(payload)
    _cache_put(cache_key, results)
    return results


def _normalize_places_payload(payload: Any) -> list[PlaceResult]:
    """Best-effort normalisation. Malformed rows are skipped, not raised."""
    if not isinstance(payload, dict):
        return []
    places = payload.get("places")
    if not isinstance(places, list):
        return []

    out: list[PlaceResult] = []
    for raw in places:
        if not isinstance(raw, dict):
            continue
        place_id = raw.get("id")
        location = raw.get("location") or {}
        lat = location.get("latitude")
        lng = location.get("longitude")
        display_name = raw.get("displayName") or {}
        name = display_name.get("text") if isinstance(display_name, dict) else None
        # New API surfaces both formattedAddress and shortFormattedAddress.
        # Prefer the short form (suburb-level) for UI density; fall back
        # to the long form when the short one is absent.
        address = raw.get("shortFormattedAddress") or raw.get("formattedAddress")
        types = raw.get("types") or []
        if (
            not isinstance(place_id, str)
            or not isinstance(name, str)
            or not isinstance(lat, (int, float))
            or not isinstance(lng, (int, float))
        ):
            continue
        out.append(
            PlaceResult(
                place_id=place_id,
                name=name,
                latitude=float(lat),
                longitude=float(lng),
                address=address if isinstance(address, str) else None,
                types=tuple(t for t in types if isinstance(t, str)),
            )
        )
    return out


__all__ = [
    "PlaceResult",
    "search_sport_places",
]
