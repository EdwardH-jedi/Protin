"""Google Places (New) provider for venue discovery.

This module is intentionally a provider boundary:

* it keeps the Google Places API key server-side;
* it maps app sports to a hybrid Nearby Search + Text Search strategy;
* it normalises Google rows into ``PlaceResult`` objects;
* it returns coarse, non-leaky provider status for the mobile picker; and
* it exposes an opaque cursor for Text Search pagination.

Nothing in this file persists Google Places content to the local Venue table.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.core.config import get_settings

_log = logging.getLogger(__name__)

PlacesStatus = Literal["ok", "disabled", "quota_exceeded", "error"]
PlaceConfidence = Literal["high", "medium", "low"]

_PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
_PLACES_TEXT_URL = "https://places.googleapis.com/v1/places:searchText"
_PLACES_DETAILS_URL_TEMPLATE = "https://places.googleapis.com/v1/{name}"

_FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.location",
        "places.formattedAddress",
        "places.shortFormattedAddress",
        "places.types",
        "places.primaryType",
        "places.googleMapsUri",
        "places.attributions",
        "nextPageToken",
    ]
)

# Place Details field mask — narrowed to what the venue detail card
# actually renders. Heavy SKU fields (reviews, photos, priceLevel) stay
# out of the mask so a "view venue" tap costs the minimum SKU bracket.
_DETAILS_FIELD_MASK = ",".join(
    [
        "id",
        "displayName",
        "formattedAddress",
        "shortFormattedAddress",
        "location",
        "types",
        "primaryType",
        "googleMapsUri",
        "websiteUri",
        "nationalPhoneNumber",
        "internationalPhoneNumber",
        "businessStatus",
        "rating",
        "userRatingCount",
        "regularOpeningHours",
        "currentOpeningHours",
        "attributions",
    ]
)

_DEFAULT_TIMEOUT_SECONDS = 10.0
_DEFAULT_RADIUS_KM = 10.0
_DEFAULT_LIMIT = 20
_PLACES_MAX_RADIUS_M = 50_000
_PLACES_MAX_RESULT_COUNT = 20


@dataclass(frozen=True)
class SportPlaceStrategy:
    """Google Places search strategy for one app sport."""

    nearby_types: tuple[str, ...] = ()
    text_queries: tuple[str, ...] = ()


# Use Nearby Search where Google has useful type coverage. Use Text Search as
# the density layer for sport-specific phrases, especially sports without a
# dedicated primary type or where public courts are inconsistently typed.
#
# The CANONICAL phrase for each sport (the one pinned by
# ``test_text_query_sports_send_searchtext_with_keyword`` in
# apps/api/tests/test_places.py) is intentionally first in each tuple.
# Add new phrases AFTER the canonical one so existing tests keep passing.
# Strategy = playable-facility search, not "sport keyword" search.
#
# Every text_queries tuple lists FACILITIES (courts, fields, ranges,
# tracks, centres). The bare sport word (``"golf"`` / ``"tennis"`` /
# ``"basketball"`` / etc.) is deliberately excluded — searching for
# ``"golf"`` returns golf retail / pro shops as much as it returns
# golf courses, and we'd then pay the Places SKU to fetch retail
# rows the playable classifier ends up rejecting. Keeping retail
# OUT of the query in the first place is cheaper and produces a
# tighter result set.
#
# The CANONICAL phrase for each sport (pinned by
# ``test_text_query_sports_send_searchtext_with_keyword``) is
# intentionally first in each tuple. Add new phrases AFTER the
# canonical one so existing tests keep passing.
_SPORT_STRATEGIES: dict[str, SportPlaceStrategy] = {
    "tennis": SportPlaceStrategy(
        nearby_types=("tennis_court", "sports_complex", "sports_club"),
        text_queries=(
            "tennis court",
            "tennis courts",
            "public tennis court",
            "tennis club",
            "tennis centre",
            "tennis center",
            "indoor tennis court",
        ),
    ),
    "basketball": SportPlaceStrategy(
        nearby_types=("athletic_field", "sports_complex", "playground", "park"),
        text_queries=(
            "basketball court",
            "public basketball court",
            "indoor basketball court",
            "outdoor basketball court",
            "basketball stadium",
            "sports centre basketball court",
            "recreation centre basketball court",
        ),
    ),
    "badminton": SportPlaceStrategy(
        nearby_types=("sports_complex", "gym", "sports_club"),
        text_queries=(
            "badminton court",
            "badminton courts",
            "badminton centre",
            "badminton center",
            "indoor badminton court",
            "sports hall badminton",
            "indoor sports centre badminton",
            "recreation centre badminton",
        ),
    ),
    "soccer": SportPlaceStrategy(
        nearby_types=("athletic_field", "stadium", "sports_complex", "park"),
        text_queries=(
            "soccer field",
            "football field",
            "football pitch",
            "soccer pitch",
            "futsal court",
            "indoor soccer court",
            "sports field soccer",
            "public soccer field",
        ),
    ),
    "football": SportPlaceStrategy(
        nearby_types=("athletic_field", "stadium", "sports_complex", "park"),
        # Aligned with soccer — same facilities, just the canonical
        # phrase swapped to "football field" first.
        text_queries=(
            "football field",
            "soccer field",
            "football pitch",
            "soccer pitch",
            "futsal court",
            "indoor soccer court",
            "sports field soccer",
            "public soccer field",
        ),
    ),
    "running": SportPlaceStrategy(
        # ``city_park`` is on Google Places (New)'s accepted type list
        # and is the canonical anchor for council / municipal parks
        # where most public running loops live. Without it the picker
        # missed large city parks (Centennial, Sydney Park) that aren't
        # tagged as ``athletic_field`` or ``stadium`` in Google's data.
        nearby_types=("athletic_field", "stadium", "park", "city_park"),
        text_queries=(
            "running track",
            "athletics track",
            "public running track",
            "sports oval",
            "running trail",
            "park running trail",
            "athletics field",
        ),
    ),
    "gym": SportPlaceStrategy(
        nearby_types=("gym", "fitness_center"),
        # ``gym`` is BOTH the sport name AND the facility noun, so it
        # stays in the pack. This is the only sport with that overlap.
        text_queries=(
            "gym",
            "fitness centre",
            "fitness center",
            "training gym",
            "health club",
            "indoor fitness centre",
        ),
    ),
    "golf": SportPlaceStrategy(
        nearby_types=("golf_course", "indoor_golf_course"),
        text_queries=(
            "golf course",
            "golf club",
            "driving range",
            "golf driving range",
            "mini golf",
            "putt putt",
            "pitch and putt",
            "public golf course",
        ),
    ),
}

# Bare sport keywords that, when supplied as an explicit ``q``, are
# REPLACED with the sport's playable-facility pack. Mobile sometimes
# echoes the sport name back as q (e.g. user types "golf" in the search
# box) — a bare-keyword Text Search returns retail / pro shops at the
# same SKU spend as a proper "golf course" query. The guard drops the
# bare q so the default playable fan-out fires instead. Legitimate
# specific q values like "Moore Park Golf Course" or "driving range"
# are unaffected because they don't match this set.
_BARE_SPORT_KEYWORD_Q: frozenset[str] = frozenset(
    {
        "golf",
        "soccer",
        "football",
        "basketball",
        "tennis",
        "badminton",
        "running",
    }
)


# Generic fallback for free-text "q" overrides AND for any sport label
# we don't carry in ``_SPORT_STRATEGIES``. Keeps the picker alive for
# new sports that haven't been mapped yet — better than an empty list.
_GENERAL_FALLBACK_STRATEGY = SportPlaceStrategy(
    nearby_types=("sports_complex", "stadium", "park"),
    text_queries=(
        "sports complex",
        "sports centre",
        "recreation centre",
        "park",
        "stadium",
    ),
)

# Internal classification band used by the playability classifier. Only
# "high" / "medium" / "low" ever escape to the wire (PlaceConfidence);
# "rejected" rows are dropped in ``_run_hybrid_search`` before returning.
_PlayabilityBand = Literal["high", "medium", "low", "rejected"]


# Sport-specific Google Places (New) type signals. These are the
# strongest "Google itself says this is the right thing" signal. Note
# the bare sport WORD (e.g. ``"golf"``) is intentionally absent — a
# place named "Big Golf" should NOT be high-confidence just because the
# sport word appears in the name (see runbook §10.5).
_SPORT_TYPE_SIGNALS: dict[str, tuple[str, ...]] = {
    "tennis": ("tennis_court",),
    "golf": ("golf_course", "indoor_golf_course"),
    "gym": ("gym", "fitness_center"),
    "running": ("athletic_field",),
    "basketball": ("basketball_court",),
    "badminton": ("badminton_court",),
    "soccer": ("soccer_field",),
    "football": ("soccer_field",),
}

# Generic infrastructure types that are PLAUSIBLY playable for any sport
# but not sport-specific. Mid-tier evidence; combined with allow keywords
# or sport-specific type signals to reach high confidence.
_MEDIUM_CONFIDENCE_TYPES = frozenset(
    {
        "sports_complex",
        "sports_club",
        "stadium",
        "park",
        "city_park",
        "athletic_field",
        "playground",
        "recreation_center",
        "gym",
        "fitness_center",
    }
)

# Strong-allow Google types from the spec. A place tagged with one of
# these is more than just "near a venue" — it's listed by Google as
# the venue.
_STRONG_ALLOW_TYPES = frozenset(
    {
        "golf_course",
        "gym",
        "stadium",
        "park",
        "sports_complex",
    }
)

# Hard-reject Google types: retail / shopping surfaces. Any place tagged
# with one of these is filtered out before classification, regardless
# of how its name reads — Google has explicitly identified it as a
# store, not a playable venue.
_REJECT_TYPES = frozenset(
    {
        "store",
        "clothing_store",
        "shoe_store",
        "sporting_goods_store",
        "shopping_mall",
    }
)

# Per-sport allow phrases. These are PLAYABLE-INFRASTRUCTURE phrases —
# "tennis court" is allowed, the bare word "tennis" is NOT. Generic
# infrastructure terms like "sports complex", "park", and "stadium"
# are deliberately scoped: they belong on the running allow list
# (parks are running venues by definition) but NOT on the soccer or
# basketball allow lists — an anonymous "Bondi Park" is not on its
# own evidence of a soccer venue, and the picker should classify it
# as "low" rather than promote it to medium without a sport-specific
# hit.
_PLAYABLE_KEYWORDS_ALLOW: dict[str, tuple[str, ...]] = {
    "golf": (
        "golf course",
        "golf club",
        "driving range",
        "golf range",
        "mini golf",
        "putt putt",
        "pitch and putt",
        "golf links",
        "country club",
        # Bare nouns the user spec calls out — match as whole words so
        # "Cooking Course" does NOT trigger (substring match would).
        "course",
        "links",
    ),
    "tennis": (
        "tennis court",
        "tennis courts",
        "tennis centre",
        "tennis center",
        "tennis club",
        "indoor tennis",
    ),
    "badminton": (
        "badminton court",
        "badminton courts",
        "badminton centre",
        "badminton center",
        "indoor sports centre",
        "indoor sports center",
        "sports hall",
        "recreation centre",
        "recreation center",
    ),
    "basketball": (
        "basketball court",
        "basketball courts",
        "indoor court",
        "indoor courts",
        "outdoor court",
        "outdoor courts",
        "sports centre",
        "sports center",
        "recreation centre",
        "recreation center",
        "stadium",
    ),
    "gym": (
        "gym",
        "fitness centre",
        "fitness center",
        "training gym",
        "health club",
    ),
    "running": (
        "running track",
        "athletics track",
        "track",
        "trail",
        "oval",
        "park",
        "sports park",
    ),
    "soccer": (
        "soccer field",
        "football field",
        "football pitch",
        "soccer pitch",
        "futsal court",
        "indoor soccer",
        "sports field",
    ),
    "football": (
        "soccer field",
        "football field",
        "football pitch",
        "soccer pitch",
        "futsal court",
        "indoor soccer",
        "sports field",
    ),
}

# Cross-sport retail markers. A name match against ANY of these
# rejects regardless of which sport was requested. Per-sport
# ``_PLAYABLE_KEYWORDS_REJECT`` still adds sport-specific variants
# (e.g. golf-only "lessons"/"academy"). Matched with word boundaries
# so single tokens like "shop" / "store" do NOT trip on "workshop" /
# "bookstore".
_GLOBAL_REJECT_KEYWORDS: tuple[str, ...] = (
    "shop",
    "store",
    "retail",
    "pro shop",
    "warehouse",
    "equipment",
    "fitting",
    "apparel",
    "supplement",
    "nutrition shop",
    "shoe store",
)

# Per-sport reject phrases. Matched ONLY against the venue name (not
# the address — "Shopping Plaza" in a street name shouldn't reject
# "Bondi Tennis Club, Shopping Plaza Lane"). Single-word entries like
# "shop" and "store" are matched with word boundaries so they do not
# trigger on "workshop" / "bookstore".
_PLAYABLE_KEYWORDS_REJECT: dict[str, tuple[str, ...]] = {
    "golf": (
        "pro shop",
        "golf shop",
        "golf store",
        "golf warehouse",
        "golf equipment",
        "golf fitting",
        "club fitting",
        "lessons",
        "academy",
        "retail",
        "shop",
        "store",
    ),
    "tennis": (
        "tennis shop",
        "pro shop",
        "racquet store",
        "racket store",
        "stringing",
        "equipment",
        "retail",
        "shop",
        "store",
    ),
    "badminton": (
        "badminton shop",
        "racquet store",
        "racket store",
        "equipment",
        "retail",
        "shop",
        "store",
    ),
    "basketball": (
        "basketball shop",
        "sneaker store",
        "shoes",
        "apparel",
        "retail",
        "shop",
        "store",
    ),
    "gym": (
        "supplement store",
        "fitness equipment",
        "nutrition shop",
        "apparel",
        "retail",
        "shop",
        "store",
    ),
    "running": (
        "running shop",
        "shoe store",
        "shoes",
        "apparel",
        "retail",
        "shop",
        "store",
    ),
    "soccer": (
        "soccer shop",
        "football shop",
        "apparel",
        "shoes",
        "retail",
        "shop",
        "store",
    ),
    "football": (
        "soccer shop",
        "football shop",
        "apparel",
        "shoes",
        "retail",
        "shop",
        "store",
    ),
}


def _kw_in_text(keyword: str, text: str) -> bool:
    """Whole-word keyword match.

    Uses word boundaries so single-word rejects like ``shop`` /
    ``store`` do NOT trigger on substrings like ``workshop`` /
    ``bookstore``. Multi-word phrases like ``pro shop`` are matched as
    a phrase with word boundaries on each side.
    """
    pattern = r"\b" + re.escape(keyword) + r"\b"
    return bool(re.search(pattern, text))


def _classify_playability(
    *,
    name: str,
    types: tuple[str, ...],
    primary_type: str | None,
    address: str | None,
    sport: str,
    matched_query: str | None = None,
) -> tuple[_PlayabilityBand, str | None]:
    """Sport-aware classifier — see runbook §10.5.

    Returns ``(band, reject_reason)``. ``"rejected"`` means the place
    looks like retail / coaching / equipment rather than a playable
    venue; the caller drops these rows before they reach mobile.

    Scoring:
      * sport-specific Google type → +3
      * generic playable type (gym, park, stadium, …) → +1
      * sport-specific allow keyword in NAME → +2
      * sport-specific allow keyword in ADDRESS → +1
    Bands: ``>=3`` high · ``==2`` medium · ``==1`` low · ``<=0`` rejected.

    A place is hard-rejected (before scoring) if:
      * its primary_type or any of its types is in ``_REJECT_TYPES``, or
      * its name contains any sport-specific reject keyword.

    The bare sport word in a name (e.g. "golf" in "Big Golf") does
    nothing on its own — that's the explicit fix for the false
    positives the previous classifier let through.
    """

    name_lower = name.lower()
    address_lower = (address or "").lower()
    types_lower = tuple(t.lower() for t in types)
    primary_lower = (primary_type or "").lower()
    sport_lower = sport.strip().lower()

    # 1. Type-based hard reject — Google has tagged this as retail.
    candidate_types = (
        (primary_lower, *types_lower) if primary_lower else types_lower
    )
    for t in candidate_types:
        if t in _REJECT_TYPES:
            return "rejected", f"reject_type:{t}"

    # 2. Keyword-based hard reject in the venue NAME only.
    # Cross-sport retail markers first (warehouse / fitting / apparel /
    # supplement / nutrition shop / shoe store / shop / store / retail /
    # pro shop / equipment) — these reject regardless of sport. The
    # per-sport reject table below adds sport-specific variants on top
    # (e.g. golf-only "lessons" / "academy").
    for kw in _GLOBAL_REJECT_KEYWORDS:
        if _kw_in_text(kw, name_lower):
            return "rejected", f"reject_keyword:{kw}"

    reject_keywords = _PLAYABLE_KEYWORDS_REJECT.get(sport_lower, ())
    for kw in reject_keywords:
        if _kw_in_text(kw, name_lower):
            return "rejected", f"reject_keyword:{kw}"

    # 3. Positive-signal scoring.
    #
    # Sport-specific signals (sport-typed Google type, sport-specific
    # allow keyword in name or address) are evidence the place serves
    # the requested sport. Generic infrastructure (sports_complex /
    # park / gym / stadium / sports_club / athletic_field / …) is
    # plausibility-only — it should NOT lift a row to "medium" on its
    # own. Without any sport-specific signal, generic infrastructure
    # caps at "low" so sparse-area coverage survives without falsely
    # claiming a confident match (e.g. a random sports_complex isn't
    # automatically a tennis venue).
    #
    # _STRONG_ALLOW_TYPES and _MEDIUM_CONFIDENCE_TYPES overlap on
    # sports_complex/park/gym/stadium. Collapse the two tiers to a
    # single +1 generic point so the same generic type isn't
    # double-counted.
    sport_specific_score = 0
    has_sport_specific_signal = False

    sport_types = _SPORT_TYPE_SIGNALS.get(sport_lower, ())
    if sport_types and (
        primary_lower in sport_types or any(t in sport_types for t in types_lower)
    ):
        sport_specific_score += 3
        has_sport_specific_signal = True

    allow_keywords = _PLAYABLE_KEYWORDS_ALLOW.get(sport_lower, ())
    if any(_kw_in_text(kw, name_lower) for kw in allow_keywords):
        sport_specific_score += 2
        has_sport_specific_signal = True

    if address_lower and any(
        _kw_in_text(kw, address_lower) for kw in allow_keywords
    ):
        sport_specific_score += 1
        has_sport_specific_signal = True

    generic_match = (
        primary_lower in _STRONG_ALLOW_TYPES
        or any(t in _STRONG_ALLOW_TYPES for t in types_lower)
        or primary_lower in _MEDIUM_CONFIDENCE_TYPES
        or any(t in _MEDIUM_CONFIDENCE_TYPES for t in types_lower)
    )
    generic_score = 1 if generic_match else 0

    if has_sport_specific_signal:
        score = sport_specific_score + generic_score
    else:
        # Generic infrastructure with NO sport-specific evidence stays
        # at "low" (score 1) regardless. Avoids "Anonymous Park" being
        # called a medium tennis/basketball venue. Other sports keep
        # low-confidence generic infra for sparse-area coverage.
        #
        # GOLF EXCEPTION — query-intent-aware. Golf is strict because
        # generic infra (sports_complex/park/stadium/establishment)
        # without ANY golf playable evidence is overwhelmingly not a
        # golf venue. BUT a row that surfaced via a specific playable
        # Text Search query ("golf course", "driving range", "mini
        # golf", …) carries query-intent evidence: Google's keyword
        # match says the row is relevant to that playable phrase. As
        # long as the row has cleared the retail/pro-shop reject paths
        # above, allow it at LOW confidence. Without that query
        # context (Nearby-only origin, or no origin) reject — the row
        # only matched on a generic TYPE, which for golf wasn't
        # golf_course/indoor_golf_course (else has_sport_specific_signal
        # would be True). Smoke-coverage fix from the Codex follow-up:
        # real Sydney golf venues that Google doesn't tag as
        # golf_course (e.g. "Concord Golf") used to vanish under
        # blanket rejection.
        if sport_lower == "golf":
            if matched_query and matched_query.startswith("text:"):
                return "low", None
            return "rejected", "golf_no_playable_signal"
        score = min(generic_score, 1)

    if score >= 3:
        return "high", None
    if score == 2:
        return "medium", None
    if score == 1:
        return "low", None
    return "rejected", "score_too_low"


@dataclass(frozen=True)
class PlaceResult:
    """Normalised Places row. Stable shape; raw Google JSON does not leak."""

    place_id: str
    name: str
    latitude: float
    longitude: float
    address: str | None
    types: tuple[str, ...]
    primary_type: str | None = None
    google_maps_uri: str | None = None
    attributions: tuple[str, ...] = ()
    # Advisory match confidence vs the requested sport. Set by
    # ``_classify_confidence`` during the hybrid search; defaults to
    # "medium" so a caller constructing a PlaceResult directly (tests,
    # fixtures) gets a non-misleading default.
    confidence: PlaceConfidence = "medium"


@dataclass(frozen=True)
class SearchResult:
    """Provider call outcome plus normalised rows."""

    status: PlacesStatus
    results: list[PlaceResult]
    next_page_token: str | None = None


@dataclass
class _CacheEntry:
    expires_at: float
    value: SearchResult


# Short TTL for Places search responses. Google's terms restrict
# long-term caching of Places content (place_id is the only identifier
# safe to store indefinitely — content like names/addresses must be
# refreshed). 30 minutes is short enough to keep content reasonably
# fresh, long enough to dedupe concurrent searches across a Sydney-scale
# tester pool that share a 2dp lat/lng bucket (~1 km grid).
#
# Note: this is a process-local in-memory cache, not Redis. On
# multi-instance deploys each replica warms its own cache. Acceptable
# for v1.1; promote to Redis if quota inflation becomes visible. See
# docs/runbooks/venues.md.
_CACHE_TTL_SECONDS = 30 * 60
_CACHE_MAX_ENTRIES = 256
_CacheKey = tuple[str, float, float, float, int, str, str]
_CACHE: "OrderedDict[_CacheKey, _CacheEntry]" = OrderedDict()


def _cache_key(
    *,
    sport: str,
    lat: float,
    lng: float,
    radius_km: float,
    limit: int,
    query_text: str | None = None,
    page_token: str | None = None,
) -> _CacheKey:
    return (
        sport.lower(),
        round(lat, 2),
        round(lng, 2),
        round(radius_km, 1),
        max(1, min(limit, 50)),
        (query_text or "").strip().lower(),
        page_token or "",
    )


def _cache_get(key: _CacheKey) -> SearchResult | None:
    entry = _CACHE.get(key)
    if entry is None:
        return None
    if entry.expires_at <= time.monotonic():
        _CACHE.pop(key, None)
        return None
    _CACHE.move_to_end(key)
    return entry.value


def _cache_put(key: _CacheKey, value: SearchResult) -> None:
    _CACHE[key] = _CacheEntry(
        expires_at=time.monotonic() + _CACHE_TTL_SECONDS,
        value=value,
    )
    _CACHE.move_to_end(key)
    while len(_CACHE) > _CACHE_MAX_ENTRIES:
        _CACHE.popitem(last=False)


def _reset_cache() -> None:
    """Test hook."""

    _CACHE.clear()


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
    """Backward-compatible wrapper returning only provider rows."""

    result = await search_sport_places_v2(
        sport=sport,
        lat=lat,
        lng=lng,
        radius_km=radius_km,
        limit=limit,
        api_key=api_key,
        http_client=http_client,
        timeout_seconds=timeout_seconds,
    )
    return result.results


async def search_sport_places_v2(
    *,
    sport: str,
    lat: float,
    lng: float,
    radius_km: float = _DEFAULT_RADIUS_KM,
    limit: int = _DEFAULT_LIMIT,
    q: str | None = None,
    cursor: str | None = None,
    api_key: str | None = None,
    http_client: httpx.AsyncClient | None = None,
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS,
) -> SearchResult:
    """Search Google Places using a sport-aware hybrid strategy.

    ``q`` overrides the default sport text queries. ``cursor`` is an opaque
    value returned by this function and is only used for Text Search.
    """

    # Validate the cursor BEFORE the API-key / strategy short-circuits.
    # A bad cursor is a client error (typo / tampered / stale page) and
    # the caller deserves an "error" signal regardless of whether the
    # Places provider is otherwise enabled. Without this ordering, a
    # local/CI environment (no GOOGLE_PLACES_API_KEY) would silently
    # report status="disabled" for a malformed cursor, which the picker
    # interprets as "provider not consulted" rather than "your cursor
    # was rejected".
    page_query: str | None = None
    page_token: str | None = None
    if cursor:
        page_query, page_token = _decode_cursor(cursor)
        if not page_query or not page_token:
            return SearchResult(status="error", results=[])

    effective_key = api_key if api_key is not None else get_settings().google_places_api_key
    if not effective_key:
        return SearchResult(status="disabled", results=[])

    sport_lower = sport.strip().lower()

    # Bare-sport-keyword guard. If q is exactly a sport name (e.g.
    # "golf"/"soccer"/"basketball" with any casing/whitespace), drop it
    # so the sport's playable-facility pack fires instead of a bare-
    # keyword Text Search that pulls retail / pro shops. Specific q
    # values like "Moore Park Golf Course" / "driving range" are kept.
    if q is not None and q.strip().lower() in _BARE_SPORT_KEYWORD_Q:
        q = None

    strategy = _SPORT_STRATEGIES.get(sport_lower)
    if strategy is None and not q:
        # Cost protection: unsupported sport with no free-text override
        # never incurs a Places call. With a ``q`` we fall through to
        # the generic strategy below — the user has explicitly asked
        # to search, so honour it.
        return SearchResult(status="disabled", results=[])
    if strategy is None:
        strategy = _GENERAL_FALLBACK_STRATEGY

    query_text = (q or page_query or "").strip() or None
    cache_key = _cache_key(
        sport=sport_lower,
        lat=lat,
        lng=lng,
        radius_km=radius_km,
        limit=limit,
        query_text=query_text,
        page_token=page_token,
    )
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    radius_m = min(int(round(radius_km * 1000)), _PLACES_MAX_RADIUS_M)
    max_items = max(1, min(limit, 50))

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=timeout_seconds)
    try:
        if page_token:
            result = await _search_text_once(
                client=client,
                api_key=effective_key,
                lat=lat,
                lng=lng,
                radius_m=radius_m,
                query=query_text or sport_lower,
                limit=min(max_items, _PLACES_MAX_RESULT_COUNT),
                page_token=page_token,
            )
        else:
            result = await _run_hybrid_search(
                client=client,
                api_key=effective_key,
                sport=sport_lower,
                strategy=strategy,
                lat=lat,
                lng=lng,
                radius_m=radius_m,
                limit=max_items,
                q=query_text,
            )
    finally:
        if owns_client:
            await client.aclose()

    # Don't cache transient failures — a 30-minute cached "error" or
    # "quota_exceeded" would mask quota recovery from the next caller.
    # We DO cache successful empty results (status="ok" with results=[])
    # because "Google says no results in this radius" is a stable answer
    # worth deduping. Cost protection still holds: error states aren't
    # retried for any single picker session because the provider call is
    # already short-circuited per coords on subsequent calls.
    if result.status == "ok":
        _cache_put(cache_key, result)
    return result


async def _run_hybrid_search(
    *,
    client: httpx.AsyncClient,
    api_key: str,
    sport: str,
    strategy: SportPlaceStrategy | None,
    lat: float,
    lng: float,
    radius_m: int,
    limit: int,
    q: str | None,
) -> SearchResult:
    rows: list[PlaceResult] = []
    # Track which query each unique place_id first came from. Used by
    # the golf classifier (see ``_classify_playability``) to discriminate
    # rows that matched a SPECIFIC playable text phrase ("golf course",
    # "driving range", "mini golf") from rows that only surfaced via a
    # Nearby Search type filter — the former carry stronger "query
    # intent" evidence for sparse-data sports like golf. ``setdefault``
    # preserves the first origin so subsequent fan-out calls don't
    # overwrite a Nearby hit with a Text hit (or vice versa).
    row_origins: dict[str, str] = {}
    next_page_token: str | None = None
    saw_quota = False
    saw_error = False

    if q:
        # For supported sports the user's free-text overrides the
        # default sport packs — they've explicitly asked. For the
        # general-fallback strategy (used when sport is unknown but a
        # q was supplied) we also fan out into the fallback packs so
        # the picker still surfaces nearby parks / sports complexes /
        # recreation centres alongside whatever Google returns for q.
        if strategy is _GENERAL_FALLBACK_STRATEGY:
            text_queries = (q,) + strategy.text_queries
            nearby_types: tuple[str, ...] = strategy.nearby_types
        else:
            text_queries = (q,)
            nearby_types = ()
    else:
        text_queries = strategy.text_queries if strategy else (sport,)
        nearby_types = strategy.nearby_types if strategy else ()

    # Run Nearby Search + ALL text queries. We deliberately do NOT
    # short-circuit on ``len(rows) >= limit``: when Nearby fills its
    # 20-row cap on the first call, an early break starved the
    # sport-specific text packs (e.g. for "tennis" the picker only ever
    # saw type=sports_complex rows because "tennis court" / "tennis
    # club" never fired). Each per-call result count is pinned at the
    # Places-API hard cap (20); fan-out is bounded by the strategy
    # tuples (<= 5 phrases) so worst-case spend is 1 Nearby + N Text
    # calls per uncached invocation, which the 2dp lat/lng cache
    # already collapses to one for repeated picker opens.
    per_call_limit = _PLACES_MAX_RESULT_COUNT

    if nearby_types:
        nearby = await _search_nearby_once(
            client=client,
            api_key=api_key,
            lat=lat,
            lng=lng,
            radius_m=radius_m,
            included_types=nearby_types,
            limit=per_call_limit,
        )
        nearby_origin = "nearby:" + ",".join(nearby_types)
        for r in nearby.results:
            row_origins.setdefault(r.place_id, nearby_origin)
        rows.extend(nearby.results)
        saw_quota = saw_quota or nearby.status == "quota_exceeded"
        saw_error = saw_error or nearby.status == "error"

    for query in text_queries:
        text = await _search_text_once(
            client=client,
            api_key=api_key,
            lat=lat,
            lng=lng,
            radius_m=radius_m,
            query=query,
            limit=per_call_limit,
        )
        text_origin = f"text:{query}"
        for r in text.results:
            row_origins.setdefault(r.place_id, text_origin)
        rows.extend(text.results)
        saw_quota = saw_quota or text.status == "quota_exceeded"
        saw_error = saw_error or text.status == "error"
        if text.next_page_token and next_page_token is None:
            next_page_token = _encode_cursor(query=query, page_token=text.next_page_token)

    raw_count = len(rows)
    deduped = _dedupe_places(rows)

    # Sport-aware playable classification. Rows that look like pro
    # shops, retail stores, coaching-only academies, or generic
    # businesses whose only sport signal is the keyword in the name
    # are dropped here BEFORE they reach the mobile picker. Surviving
    # rows are tagged with a high/medium/low confidence band; the
    # picker may render this but never filters on it (sparse areas
    # should still surface low-confidence rows).
    classified: list[PlaceResult] = []
    rejected_count = 0
    for row in deduped:
        band, reason = _classify_playability(
            name=row.name,
            types=row.types,
            primary_type=row.primary_type,
            address=row.address,
            sport=sport,
            matched_query=row_origins.get(row.place_id),
        )
        if band == "rejected":
            rejected_count += 1
            # debug-level: per-row rejections would otherwise spam
            # production logs (every "Big Golf" / pro shop / shoe
            # store hit fires one line per uncached search). The
            # aggregated per-call summary below is emitted at info
            # so the operator still sees rejected-count trends; raise
            # the per-row line to info only when actively debugging
            # a strategy regression. Address / coordinates are NOT
            # logged — name is the minimum needed to identify the row.
            _log.debug(
                "places_playability_rejected sport=%s name=%r reason=%s",
                sport,
                row.name,
                reason,
            )
            continue
        classified.append(_with_band(row, band))

    status: PlacesStatus = "ok"
    if not classified and saw_quota:
        status = "quota_exceeded"
    elif not classified and saw_error:
        status = "error"

    returned = classified[:limit]
    _log.info(
        "places_hybrid_search sport=%s radius_m=%d raw=%d deduped=%d rejected=%d returned=%d status=%s",
        sport,
        radius_m,
        raw_count,
        len(deduped),
        rejected_count,
        len(returned),
        status,
    )

    return SearchResult(
        status=status,
        results=returned,
        next_page_token=next_page_token,
    )


def _with_band(row: PlaceResult, band: PlaceConfidence) -> PlaceResult:
    """Return a copy of ``row`` with ``confidence`` set to ``band``."""

    if row.confidence == band:
        return row
    return PlaceResult(
        place_id=row.place_id,
        name=row.name,
        latitude=row.latitude,
        longitude=row.longitude,
        address=row.address,
        types=row.types,
        primary_type=row.primary_type,
        google_maps_uri=row.google_maps_uri,
        attributions=row.attributions,
        confidence=band,
    )


async def _search_nearby_once(
    *,
    client: httpx.AsyncClient,
    api_key: str,
    lat: float,
    lng: float,
    radius_m: int,
    included_types: tuple[str, ...],
    limit: int,
) -> SearchResult:
    body: dict[str, Any] = {
        "includedTypes": list(included_types),
        "maxResultCount": max(1, min(limit, _PLACES_MAX_RESULT_COUNT)),
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": radius_m,
            },
        },
    }
    return await _post_places(
        client=client,
        api_key=api_key,
        url=_PLACES_NEARBY_URL,
        body=body,
        log_context=f"nearby:{','.join(included_types)}",
    )


async def _search_text_once(
    *,
    client: httpx.AsyncClient,
    api_key: str,
    lat: float,
    lng: float,
    radius_m: int,
    query: str,
    limit: int,
    page_token: str | None = None,
) -> SearchResult:
    body: dict[str, Any] = {
        "textQuery": query,
        "pageSize": max(1, min(limit, _PLACES_MAX_RESULT_COUNT)),
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": radius_m,
            },
        },
        "rankPreference": "DISTANCE",
    }
    if page_token:
        body["pageToken"] = page_token

    return await _post_places(
        client=client,
        api_key=api_key,
        url=_PLACES_TEXT_URL,
        body=body,
        log_context=f"text:{query}",
    )


async def _post_places(
    *,
    client: httpx.AsyncClient,
    api_key: str,
    url: str,
    body: dict[str, Any],
    log_context: str,
) -> SearchResult:
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
    }

    try:
        response = await client.post(url, json=body, headers=headers)
    except httpx.TimeoutException:
        _log.warning("Google Places request timed out (%s)", log_context)
        return SearchResult(status="error", results=[])
    except httpx.HTTPError as exc:
        _log.warning("Google Places transport error (%s): %s", log_context, exc)
        return SearchResult(status="error", results=[])
    except Exception as exc:  # noqa: BLE001 - provider boundary must not raise
        _log.warning("Google Places unexpected error (%s): %s", log_context, exc)
        return SearchResult(status="error", results=[])

    if response.status_code != 200:
        _log.warning(
            "Google Places non-200 (%s status=%s)",
            log_context,
            response.status_code,
        )
        if response.status_code in {402, 403, 429}:
            return SearchResult(status="quota_exceeded", results=[])
        return SearchResult(status="error", results=[])

    try:
        payload = response.json()
    except ValueError:
        _log.warning("Google Places returned non-JSON body (%s)", log_context)
        return SearchResult(status="error", results=[])

    return SearchResult(
        status="ok",
        results=_normalize_places_payload(payload),
        next_page_token=_extract_next_page_token(payload),
    )


def _normalize_places_payload(payload: Any) -> list[PlaceResult]:
    """Best-effort normalisation. Malformed rows are skipped."""

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
        address = raw.get("shortFormattedAddress") or raw.get("formattedAddress")
        types = raw.get("types") or []
        attributions = raw.get("attributions") or []
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
                primary_type=raw.get("primaryType")
                if isinstance(raw.get("primaryType"), str)
                else None,
                google_maps_uri=raw.get("googleMapsUri")
                if isinstance(raw.get("googleMapsUri"), str)
                else None,
                attributions=tuple(
                    _normalise_attribution(a)
                    for a in attributions
                    if _normalise_attribution(a)
                ),
            )
        )
    return out


def _normalise_attribution(raw: Any) -> str | None:
    if isinstance(raw, str):
        return raw
    if not isinstance(raw, dict):
        return None
    provider = raw.get("provider")
    provider_uri = raw.get("providerUri")
    if isinstance(provider, str) and isinstance(provider_uri, str):
        return f'<a href="{provider_uri}">{provider}</a>'
    if isinstance(provider, str):
        return provider
    return None


def _extract_next_page_token(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    token = payload.get("nextPageToken")
    return token if isinstance(token, str) and token else None


def _dedupe_places(rows: list[PlaceResult]) -> list[PlaceResult]:
    seen: set[str] = set()
    out: list[PlaceResult] = []
    for row in rows:
        key = row.place_id
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def _encode_cursor(*, query: str, page_token: str) -> str:
    payload = json.dumps({"q": query, "token": page_token}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[str | None, str | None]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        payload = json.loads(raw)
    except Exception:  # noqa: BLE001 - invalid user-supplied cursor
        return None, None
    if not isinstance(payload, dict):
        return None, None
    query = payload.get("q")
    token = payload.get("token")
    if not isinstance(query, str) or not isinstance(token, str):
        return None, None
    return query, token


@dataclass(frozen=True)
class PlaceDetails:
    """Normalised Place Details (New) row.

    Stable shape; never leaks raw Google JSON. Optional fields default
    to ``None`` so a partial Google response (rating-less / hour-less
    venue) is still serialisable.
    """

    place_id: str
    name: str
    latitude: float
    longitude: float
    address: str | None = None
    types: tuple[str, ...] = ()
    primary_type: str | None = None
    google_maps_uri: str | None = None
    website_uri: str | None = None
    phone_national: str | None = None
    phone_international: str | None = None
    business_status: str | None = None
    rating: float | None = None
    user_rating_count: int | None = None
    opening_hours_weekday_text: tuple[str, ...] = ()
    attributions: tuple[str, ...] = ()


@dataclass(frozen=True)
class PlaceDetailsResult:
    """Provider call outcome for a Place Details fetch."""

    status: PlacesStatus
    details: PlaceDetails | None = None


async def fetch_place_details(
    *,
    place_id: str,
    api_key: str | None = None,
    http_client: httpx.AsyncClient | None = None,
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS,
) -> PlaceDetailsResult:
    """Fetch Google Place Details (New) for a single ``place_id``.

    Used by /venues/places/{place_id} — a lazy-load endpoint that is
    called only when the user opens a Google-Places-sourced venue.
    Search results never trigger this call: keeping Place Details
    one-tap-per-user is the primary cost lever.

    Accepts both raw ids (``ChIJ…``) and the fully-qualified resource
    name (``places/ChIJ…``). Normalises to the resource form before
    calling Google.

    Returns a structured result so the router can map provider state
    onto an HTTP response without leaking raw Google error bodies.
    """

    effective_key = api_key if api_key is not None else get_settings().google_places_api_key
    if not effective_key:
        return PlaceDetailsResult(status="disabled")

    normalised_id = place_id.strip()
    if not normalised_id:
        return PlaceDetailsResult(status="error")
    if not normalised_id.startswith("places/"):
        normalised_id = f"places/{normalised_id}"

    url = _PLACES_DETAILS_URL_TEMPLATE.format(name=normalised_id)
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": effective_key,
        "X-Goog-FieldMask": _DETAILS_FIELD_MASK,
    }

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=timeout_seconds)
    try:
        try:
            response = await client.get(url, headers=headers)
        except httpx.TimeoutException:
            _log.warning("Google Place Details timed out (%s)", normalised_id)
            return PlaceDetailsResult(status="error")
        except httpx.HTTPError as exc:
            _log.warning("Google Place Details transport error (%s): %s", normalised_id, exc)
            return PlaceDetailsResult(status="error")
        except Exception as exc:  # noqa: BLE001 - provider boundary must not raise
            _log.warning(
                "Google Place Details unexpected error (%s): %s", normalised_id, exc
            )
            return PlaceDetailsResult(status="error")
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code == 404:
        return PlaceDetailsResult(status="error")
    if response.status_code in {402, 403, 429}:
        return PlaceDetailsResult(status="quota_exceeded")
    if response.status_code != 200:
        _log.warning(
            "Google Place Details non-200 (%s status=%s)",
            normalised_id,
            response.status_code,
        )
        return PlaceDetailsResult(status="error")

    try:
        payload = response.json()
    except ValueError:
        _log.warning("Google Place Details returned non-JSON body (%s)", normalised_id)
        return PlaceDetailsResult(status="error")

    details = _normalize_place_details_payload(payload)
    if details is None:
        return PlaceDetailsResult(status="error")
    return PlaceDetailsResult(status="ok", details=details)


def _normalize_place_details_payload(payload: Any) -> PlaceDetails | None:
    """Best-effort normalisation. Returns None on malformed payload."""

    if not isinstance(payload, dict):
        return None
    place_id = payload.get("id")
    location = payload.get("location") or {}
    lat = location.get("latitude")
    lng = location.get("longitude")
    display_name = payload.get("displayName") or {}
    name = display_name.get("text") if isinstance(display_name, dict) else None

    if (
        not isinstance(place_id, str)
        or not isinstance(name, str)
        or not isinstance(lat, (int, float))
        or not isinstance(lng, (int, float))
    ):
        return None

    address = payload.get("shortFormattedAddress") or payload.get("formattedAddress")
    types = payload.get("types") or []
    attributions = payload.get("attributions") or []

    rating = payload.get("rating")
    user_rating_count = payload.get("userRatingCount")
    business_status = payload.get("businessStatus")

    opening = payload.get("currentOpeningHours") or payload.get("regularOpeningHours") or {}
    weekday_text = opening.get("weekdayDescriptions") if isinstance(opening, dict) else None
    if not isinstance(weekday_text, list):
        weekday_text = []

    return PlaceDetails(
        place_id=place_id,
        name=name,
        latitude=float(lat),
        longitude=float(lng),
        address=address if isinstance(address, str) else None,
        types=tuple(t for t in types if isinstance(t, str)),
        primary_type=payload.get("primaryType")
        if isinstance(payload.get("primaryType"), str)
        else None,
        google_maps_uri=payload.get("googleMapsUri")
        if isinstance(payload.get("googleMapsUri"), str)
        else None,
        website_uri=payload.get("websiteUri")
        if isinstance(payload.get("websiteUri"), str)
        else None,
        phone_national=payload.get("nationalPhoneNumber")
        if isinstance(payload.get("nationalPhoneNumber"), str)
        else None,
        phone_international=payload.get("internationalPhoneNumber")
        if isinstance(payload.get("internationalPhoneNumber"), str)
        else None,
        business_status=business_status if isinstance(business_status, str) else None,
        rating=float(rating) if isinstance(rating, (int, float)) else None,
        user_rating_count=int(user_rating_count)
        if isinstance(user_rating_count, int)
        else None,
        opening_hours_weekday_text=tuple(
            t for t in weekday_text if isinstance(t, str)
        ),
        attributions=tuple(
            _normalise_attribution(a)
            for a in attributions
            if _normalise_attribution(a)
        ),
    )


__all__ = [
    "PlaceConfidence",
    "PlaceDetails",
    "PlaceDetailsResult",
    "PlaceResult",
    "PlacesStatus",
    "SearchResult",
    "fetch_place_details",
    "search_sport_places",
    "search_sport_places_v2",
]
