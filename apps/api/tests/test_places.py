"""Tests for app.services.places — Google Places (New) provider.

No real network calls. Each test injects a mocked ``httpx.AsyncClient``
into ``search_sport_places`` and asserts on what would have been sent
and how the canned response is normalised.

Coverage:
  * empty / missing API key → no HTTP, empty result
  * sport keyword mapping (text_query) for tennis / basketball / badminton / soccer
  * sport "football" aliases to the soccer text query
  * sport type mapping for golf / gym
  * unknown sport → empty without HTTP
  * Google response normalises to ``PlaceResult`` (lat/lng/address/types)
  * malformed entries are skipped, well-formed siblings preserved
  * required field mask + API-key headers are sent
  * timeout / HTTPError / non-200 / non-JSON → empty list (fallback-safe)
  * cache prevents repeated identical provider calls
  * cache key differs by sport / radius / coords
  * empty-key short-circuit runs BEFORE cache lookup
"""

from __future__ import annotations

import logging
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.services import places as places_module
from app.services.places import (
    PlaceDetails,
    PlaceResult,
    fetch_place_details,
    search_sport_places,
    search_sport_places_v2,
)


# ─── helpers ─────────────────────────────────────────────────────────────────


def _ok_response(payload: dict[str, Any]) -> MagicMock:
    """Build a stand-in ``httpx.Response`` with the given JSON body."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = 200
    resp.json = MagicMock(return_value=payload)
    return resp


def _err_response(status_code: int = 500, body: dict | None = None) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json = MagicMock(return_value=body or {})
    return resp


def _bad_json_response() -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = 200

    def _raise_value_error() -> None:
        raise ValueError("not json")

    resp.json = MagicMock(side_effect=_raise_value_error)
    return resp


def _make_client(
    response: MagicMock | None = None,
    *,
    raise_exc: Exception | None = None,
) -> MagicMock:
    """Build a mocked ``httpx.AsyncClient`` with an async ``.post`` + ``.aclose``."""
    client = MagicMock(spec=httpx.AsyncClient)
    if raise_exc is not None:
        client.post = AsyncMock(side_effect=raise_exc)
    else:
        client.post = AsyncMock(return_value=response)
    client.aclose = AsyncMock()
    return client


def _sample_places_payload() -> dict[str, Any]:
    """Realistic Places (New) shape with two well-formed rows."""
    return {
        "places": [
            {
                "id": "places/ChIJa1",
                "displayName": {"text": "Sydney Park Tennis Centre", "languageCode": "en"},
                "location": {"latitude": -33.91, "longitude": 151.18},
                "formattedAddress": "Sydney Park Rd, Alexandria NSW 2015, Australia",
                "shortFormattedAddress": "Sydney Park Rd, Alexandria",
                "types": ["sports_complex", "establishment"],
            },
            {
                "id": "places/ChIJa2",
                "displayName": {"text": "Bondi Tennis Club", "languageCode": "en"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "formattedAddress": "1 Beach Rd, Bondi NSW 2026",
                # short address missing on purpose — fall back to long form
                "types": ["tennis_court"],
            },
        ]
    }


@pytest.fixture(autouse=True)
def _clear_cache_between_tests() -> None:
    """Module-level cache is process-global; reset on every test."""
    places_module._reset_cache()
    yield
    places_module._reset_cache()


# ─── empty-key short-circuit ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_missing_api_key_returns_empty_without_http() -> None:
    client = _make_client(_ok_response(_sample_places_payload()))
    out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="",  # explicit empty
        http_client=client,
    )
    assert out == []
    client.post.assert_not_awaited()


@pytest.mark.asyncio
async def test_empty_key_short_circuit_runs_before_cache_lookup() -> None:
    # Step 1: populate the cache with a real call (key is present).
    populated_client = _make_client(_ok_response(_sample_places_payload()))
    cached = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="present",
        http_client=populated_client,
    )
    assert len(cached) == 2

    # Step 2: re-call with the same coords but an empty key. The
    # function must short-circuit to [] without consulting the cache.
    empty_client = _make_client(_ok_response(_sample_places_payload()))
    out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="",
        http_client=empty_client,
    )
    assert out == []
    empty_client.post.assert_not_awaited()


# ─── sport mapping ───────────────────────────────────────────────────────────


def _text_query_calls(client: MagicMock) -> list[dict[str, Any]]:
    """Return the JSON bodies of every Text Search POST the mock recorded."""
    bodies: list[dict[str, Any]] = []
    for call in client.post.await_args_list:
        args, kwargs = call.args, call.kwargs
        url = args[0] if args else kwargs.get("url")
        if url == "https://places.googleapis.com/v1/places:searchText":
            bodies.append(kwargs["json"])
    return bodies


def _nearby_query_calls(client: MagicMock) -> list[dict[str, Any]]:
    bodies: list[dict[str, Any]] = []
    for call in client.post.await_args_list:
        args, kwargs = call.args, call.kwargs
        url = args[0] if args else kwargs.get("url")
        if url == "https://places.googleapis.com/v1/places:searchNearby":
            bodies.append(kwargs["json"])
    return bodies


@pytest.mark.parametrize(
    "sport, expected_text",
    [
        ("tennis", "tennis court"),
        ("basketball", "basketball court"),
        ("badminton", "badminton court"),
        ("soccer", "soccer field"),
        ("football", "football field"),
        ("running", "running track"),
    ],
)
@pytest.mark.asyncio
async def test_text_query_sports_send_searchtext_with_keyword(sport: str, expected_text: str) -> None:
    """Hybrid model: each sport fans out into a Nearby Search + one or more
    Text Searches. At least one Text Search must carry the expected sport
    phrase, hit ``places:searchText``, and use ``locationBias``."""
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places(
        sport=sport,
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    text_bodies = _text_query_calls(client)
    assert text_bodies, f"expected at least one searchText call for sport={sport}"
    assert any(b["textQuery"] == expected_text for b in text_bodies), (
        f"no Text Search with textQuery={expected_text!r}; saw {[b['textQuery'] for b in text_bodies]}"
    )
    # Text Search uses locationBias (a soft hint) and pageSize (Google New
    # API rename of maxResultCount on the Text Search surface).
    for body in text_bodies:
        assert "locationBias" in body
        assert "locationRestriction" not in body
        assert "pageSize" in body


@pytest.mark.parametrize(
    "sport, included_type",
    [
        ("golf", "golf_course"),
        ("gym", "gym"),
    ],
)
@pytest.mark.asyncio
async def test_type_mapped_sports_send_searchnearby_with_included_type(sport: str, included_type: str) -> None:
    """Type-mapped sports fire a Nearby Search containing the canonical
    Google type (alongside any related types from the strategy table)."""
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places(
        sport=sport,
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    nearby_bodies = _nearby_query_calls(client)
    assert nearby_bodies, f"expected at least one searchNearby call for sport={sport}"
    body = nearby_bodies[0]
    assert included_type in body["includedTypes"], f"includedTypes={body['includedTypes']!r} missing {included_type!r}"
    assert "locationRestriction" in body
    assert "locationBias" not in body
    assert body["maxResultCount"] >= 1


@pytest.mark.asyncio
async def test_running_nearby_includes_city_park() -> None:
    """Codex fix — Google Places (New)'s ``city_park`` is the canonical
    anchor for municipal parks where most public running loops live.
    Without it the picker missed large city parks (Centennial, Sydney
    Park) that aren't tagged ``athletic_field``."""
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places(
        sport="running",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    nearby_bodies = _nearby_query_calls(client)
    assert nearby_bodies, "expected at least one searchNearby call for running"
    included = nearby_bodies[0]["includedTypes"]
    assert "city_park" in included, f"includedTypes={included!r} missing city_park"


@pytest.mark.asyncio
async def test_unknown_sport_returns_empty_without_http() -> None:
    client = _make_client(_ok_response(_sample_places_payload()))
    out = await search_sport_places(
        sport="rugby",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert out == []
    client.post.assert_not_awaited()


@pytest.mark.asyncio
async def test_sport_case_insensitive_mapping() -> None:
    """Uppercase sport identifiers route through the same lower-cased
    strategy lookup, so the hybrid fan-out still surfaces the canonical
    tennis text query."""
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places(
        sport="TENNIS",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    text_bodies = _text_query_calls(client)
    assert any(b["textQuery"] == "tennis court" for b in text_bodies)


# ─── headers / field mask ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sends_required_field_mask_and_api_key_headers() -> None:
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="my-secret-key",
        http_client=client,
    )
    _args, kwargs = client.post.call_args
    headers = kwargs["headers"]
    assert headers["X-Goog-Api-Key"] == "my-secret-key"
    mask = headers["X-Goog-FieldMask"]
    # Minimum surface the picker can render today.
    for required in [
        "places.id",
        "places.displayName",
        "places.location",
        "places.formattedAddress",
        "places.shortFormattedAddress",
        "places.types",
    ]:
        assert required in mask, f"missing field-mask entry: {required}"
    # Heavy fields must NOT be in the mask — guards future creep into
    # more expensive Places SKUs.
    for forbidden in [
        "places.regularOpeningHours",
        "places.photos",
        "places.userRatingCount",
        "places.reviews",
        "places.priceLevel",
    ]:
        assert forbidden not in mask, f"unexpected heavy field in mask: {forbidden}"


# ─── normalisation ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_normalizes_response_to_internal_place_result() -> None:
    client = _make_client(_ok_response(_sample_places_payload()))
    out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert len(out) == 2
    first, second = out
    assert isinstance(first, PlaceResult)
    assert first.place_id == "places/ChIJa1"
    assert first.name == "Sydney Park Tennis Centre"
    assert first.latitude == pytest.approx(-33.91)
    assert first.longitude == pytest.approx(151.18)
    # Prefers short form when present.
    assert first.address == "Sydney Park Rd, Alexandria"
    assert first.types == ("sports_complex", "establishment")
    # Falls back to long form when short missing.
    assert second.address == "1 Beach Rd, Bondi NSW 2026"


@pytest.mark.asyncio
async def test_normalize_skips_malformed_rows_keeps_good_siblings() -> None:
    payload = {
        "places": [
            # Missing id — skipped.
            {
                "displayName": {"text": "No-ID Place"},
                "location": {"latitude": 0, "longitude": 0},
            },
            # Missing displayName — skipped.
            {
                "id": "places/ChIJok",
                "location": {"latitude": -33.0, "longitude": 151.0},
            },
            # Non-dict row — skipped.
            "not-a-dict",
            # Good row — kept.
            {
                "id": "places/ChIJgood",
                "displayName": {"text": "Good Place"},
                "location": {"latitude": -33.5, "longitude": 151.5},
                "formattedAddress": "Somewhere, NSW",
                "types": ["gym"],
            },
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert [r.name for r in out] == ["Good Place"]


@pytest.mark.asyncio
async def test_normalize_returns_empty_when_places_key_missing() -> None:
    client = _make_client(_ok_response({"unexpected": "shape"}))
    out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert out == []


# ─── error / quota / timeout resilience ──────────────────────────────────────


@pytest.mark.asyncio
async def test_timeout_returns_empty_list() -> None:
    client = _make_client(raise_exc=httpx.TimeoutException("upstream slow"))
    out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert out == []


@pytest.mark.asyncio
async def test_transport_error_returns_empty_list() -> None:
    client = _make_client(raise_exc=httpx.ConnectError("dns fail"))
    out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert out == []


@pytest.mark.asyncio
async def test_unexpected_exception_returns_empty_list() -> None:
    # Anything outside httpx's hierarchy still must not propagate.
    client = _make_client(raise_exc=RuntimeError("???"))
    out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert out == []


@pytest.mark.asyncio
async def test_non_2xx_status_returns_empty_list() -> None:
    client = _make_client(_err_response(status_code=429, body={"error": "quota"}))
    out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert out == []


@pytest.mark.asyncio
async def test_non_json_body_returns_empty_list() -> None:
    client = _make_client(_bad_json_response())
    out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert out == []


# ─── cache ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_prevents_duplicate_calls_for_same_args() -> None:
    """Hybrid model: the first invocation fans out into multiple Google
    calls; the second call with identical args must short-circuit on
    the in-process cache and add zero new requests."""
    client = _make_client(_ok_response(_sample_places_payload()))
    first = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    initial = client.post.await_count
    assert initial >= 1, "first invocation must fan out into at least one HTTP call"
    second = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert first == second
    assert client.post.await_count == initial, "second invocation must hit the cache and add zero new HTTP calls"


@pytest.mark.asyncio
async def test_cache_misses_when_sport_differs() -> None:
    client = _make_client(_ok_response(_sample_places_payload()))
    await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    tennis_count = client.post.await_count
    await search_sport_places(sport="basketball", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert client.post.await_count > tennis_count, "different sport must miss the cache and trigger new HTTP calls"


@pytest.mark.asyncio
async def test_cache_collapses_lat_lng_to_2dp() -> None:
    # 600m apart at Sydney latitude both round to (-33.89, 151.27) at 2 d.p.
    client = _make_client(_ok_response(_sample_places_payload()))
    await search_sport_places(sport="tennis", lat=-33.891, lng=151.271, api_key="x", http_client=client)
    initial = client.post.await_count
    await search_sport_places(sport="tennis", lat=-33.886, lng=151.273, api_key="x", http_client=client)
    assert client.post.await_count == initial, "near-identical coords must collapse to one cache key"


@pytest.mark.asyncio
async def test_cache_misses_when_radius_changes() -> None:
    client = _make_client(_ok_response(_sample_places_payload()))
    await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        radius_km=10.0,
        api_key="x",
        http_client=client,
    )
    initial = client.post.await_count
    await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        radius_km=50.0,
        api_key="x",
        http_client=client,
    )
    assert client.post.await_count > initial, "different radius must miss the cache and trigger new HTTP calls"


# ─── request body smoke checks ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_radius_km_passed_as_meters_and_capped_at_50km() -> None:
    client = _make_client(_ok_response({"places": []}))
    # Above Places' 50,000m cap — must be clamped silently.
    await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        radius_km=99.0,
        api_key="x",
        http_client=client,
    )
    # Every fan-out body — Nearby Search (locationRestriction) and
    # Text Search (locationBias) alike — must clamp to 50_000 m.
    for call in client.post.await_args_list:
        body = call.kwargs["json"]
        circle = body.get("locationBias", {}).get("circle") or body.get("locationRestriction", {}).get("circle")
        assert circle is not None, f"no circle in body: {body!r}"
        assert circle["radius"] == 50_000
        assert circle["center"] == {"latitude": -33.89, "longitude": 151.27}


@pytest.mark.asyncio
async def test_error_responses_are_not_cached() -> None:
    """A transient upstream failure must NOT be cached, otherwise a 30
    minute window of "error" would mask quota recovery for the next
    caller. Successful empty responses (Google says "no rows here")
    still cache — see test below."""

    # First call: provider returns 500. Should NOT cache.
    err_client = _make_client(_err_response(status_code=500))
    err_out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=err_client,
    )
    assert err_out == []

    # Second call with identical args. If the error had cached, this
    # would short-circuit on the cache and add zero calls; we expect it
    # to re-attempt the provider instead.
    ok_client = _make_client(_ok_response(_sample_places_payload()))
    ok_out = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=ok_client,
    )
    assert len(ok_out) == 2
    assert ok_client.post.await_count >= 1, "second call after an error must NOT short-circuit on cache"


@pytest.mark.asyncio
async def test_quota_responses_are_not_cached() -> None:
    """Same property as errors — quota exceeded must not be cached so a
    quota refill is picked up on the next request."""

    quota_client = _make_client(_err_response(status_code=429))
    out_quota = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=quota_client,
    )
    assert out_quota == []

    ok_client = _make_client(_ok_response(_sample_places_payload()))
    out_ok = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=ok_client,
    )
    assert len(out_ok) == 2
    assert ok_client.post.await_count >= 1, "quota_exceeded must not pin a cached empty response"


@pytest.mark.asyncio
async def test_max_result_count_clamped_to_places_cap() -> None:
    """Both surfaces clamp per-call results to the Places hard cap of 20.

    Nearby Search uses ``maxResultCount``; Text Search (Places New)
    uses ``pageSize``. The hybrid call fan-out exercises both fields
    in the same invocation."""
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        limit=200,
        api_key="x",
        http_client=client,
    )
    for call in client.post.await_args_list:
        body = call.kwargs["json"]
        cap = body.get("maxResultCount") or body.get("pageSize")
        assert cap is not None, f"neither maxResultCount nor pageSize present in body: {body!r}"
        assert cap <= 20


# ─── Place Details (lazy-load) ───────────────────────────────────────────────


def _details_client(
    response: MagicMock | None = None,
    *,
    raise_exc: Exception | None = None,
) -> MagicMock:
    """Build a mocked httpx.AsyncClient for the Place Details GET surface."""
    client = MagicMock(spec=httpx.AsyncClient)
    if raise_exc is not None:
        client.get = AsyncMock(side_effect=raise_exc)
    else:
        client.get = AsyncMock(return_value=response)
    client.aclose = AsyncMock()
    return client


def _details_payload(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": "places/ChIJDETAIL",
        "displayName": {"text": "Sydney Park Tennis Centre", "languageCode": "en"},
        "location": {"latitude": -33.91, "longitude": 151.18},
        "formattedAddress": "Sydney Park Rd, Alexandria NSW 2015, Australia",
        "shortFormattedAddress": "Sydney Park Rd, Alexandria",
        "types": ["tennis_court", "sports_complex"],
        "primaryType": "tennis_court",
        "googleMapsUri": "https://maps.google.com/?cid=123",
        "websiteUri": "https://example.com/syd-park-tennis",
        "nationalPhoneNumber": "(02) 9999 0000",
        "internationalPhoneNumber": "+61 2 9999 0000",
        "businessStatus": "OPERATIONAL",
        "rating": 4.4,
        "userRatingCount": 312,
        "regularOpeningHours": {
            "weekdayDescriptions": [
                "Monday: 6:00 AM – 10:00 PM",
                "Tuesday: 6:00 AM – 10:00 PM",
            ],
        },
        "attributions": [{"provider": "Listed by Syd Sport", "providerUri": "https://example.com"}],
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_place_details_missing_api_key_returns_disabled() -> None:
    """Empty key short-circuits before any HTTP call. Mirrors the
    search surface so the picker never crashes when the secret is unset
    in local/CI/reviewer environments."""
    client = _details_client(_ok_response(_details_payload()))
    result = await fetch_place_details(
        place_id="ChIJDETAIL",
        api_key="",
        http_client=client,
    )
    assert result.status == "disabled"
    assert result.details is None
    client.get.assert_not_awaited()


@pytest.mark.asyncio
async def test_place_details_normalises_response() -> None:
    """Valid Google response collapses to a normalised PlaceDetails
    dataclass — never raw Google JSON."""
    client = _details_client(_ok_response(_details_payload()))
    result = await fetch_place_details(
        place_id="ChIJDETAIL",
        api_key="x",
        http_client=client,
    )
    assert result.status == "ok"
    assert isinstance(result.details, PlaceDetails)
    d = result.details
    assert d.place_id == "places/ChIJDETAIL"
    assert d.name == "Sydney Park Tennis Centre"
    assert d.latitude == pytest.approx(-33.91)
    assert d.longitude == pytest.approx(151.18)
    # Short address preferred when present.
    assert d.address == "Sydney Park Rd, Alexandria"
    assert d.primary_type == "tennis_court"
    assert d.rating == pytest.approx(4.4)
    assert d.user_rating_count == 312
    assert d.business_status == "OPERATIONAL"
    assert d.phone_national == "(02) 9999 0000"
    assert d.phone_international == "+61 2 9999 0000"
    assert d.website_uri == "https://example.com/syd-park-tennis"
    assert len(d.opening_hours_weekday_text) == 2
    assert d.opening_hours_weekday_text[0].startswith("Monday")
    assert d.attributions  # at least one HTML attribution snippet


@pytest.mark.asyncio
async def test_place_details_accepts_bare_id_and_qualifies_it() -> None:
    """Mobile may pass either the bare ChIJ… id or the full
    ``places/ChIJ…`` resource name. The provider must accept either and
    issue the request against the qualified URL."""
    client = _details_client(_ok_response(_details_payload()))
    await fetch_place_details(
        place_id="ChIJABC",
        api_key="x",
        http_client=client,
    )
    url = client.get.await_args.args[0]
    assert url == "https://places.googleapis.com/v1/places/ChIJABC"


@pytest.mark.asyncio
async def test_place_details_sends_field_mask_and_api_key_headers() -> None:
    """Provider boundary contract — the field mask must NOT include
    heavy SKUs we don't need (photos / reviews / priceLevel) so the
    detail tap stays on the cheapest viable SKU bracket."""
    client = _details_client(_ok_response(_details_payload()))
    await fetch_place_details(
        place_id="ChIJDETAIL",
        api_key="x",
        http_client=client,
    )
    headers = client.get.await_args.kwargs["headers"]
    assert headers["X-Goog-Api-Key"] == "x"
    mask = headers["X-Goog-FieldMask"]
    for required in ("id", "displayName", "location", "businessStatus", "rating"):
        assert required in mask, f"missing field-mask entry: {required}"
    for forbidden in ("photos", "reviews", "priceLevel"):
        assert forbidden not in mask, f"unexpected heavy field in mask: {forbidden}"


@pytest.mark.asyncio
async def test_place_details_quota_response_maps_to_quota_exceeded() -> None:
    """429 / 403 surfaces as quota_exceeded so the route can map it to a
    503 without leaking a raw Google error body."""
    client = _details_client(_err_response(status_code=429))
    result = await fetch_place_details(
        place_id="ChIJDETAIL",
        api_key="x",
        http_client=client,
    )
    assert result.status == "quota_exceeded"
    assert result.details is None


@pytest.mark.asyncio
async def test_place_details_timeout_returns_error() -> None:
    client = _details_client(raise_exc=httpx.TimeoutException("slow"))
    result = await fetch_place_details(
        place_id="ChIJDETAIL",
        api_key="x",
        http_client=client,
    )
    assert result.status == "error"
    assert result.details is None


@pytest.mark.asyncio
async def test_place_details_404_returns_error() -> None:
    """An invalid place_id surfaces as 'error' so the route can return
    502 — we deliberately don't echo Google's 404 verbatim because the
    user-supplied id may have been mistyped or rotated."""
    client = _details_client(_err_response(status_code=404))
    result = await fetch_place_details(
        place_id="places/ChIJ-bogus",
        api_key="x",
        http_client=client,
    )
    assert result.status == "error"


@pytest.mark.asyncio
async def test_place_details_malformed_payload_returns_error() -> None:
    """Required fields missing → normalisation returns None → status
    'error'. Guards against silently constructing half-formed details."""
    client = _details_client(_ok_response({"id": "places/X"}))  # no displayName/location
    result = await fetch_place_details(
        place_id="ChIJDETAIL",
        api_key="x",
        http_client=client,
    )
    assert result.status == "error"


# ─── hybrid search no-early-exit + expanded packs (Codex venue density) ──


@pytest.mark.asyncio
async def test_hybrid_search_runs_all_text_queries_even_when_nearby_fills() -> None:
    """Regression guard for the dominant cause of "only a few places":
    when Nearby Search filled its 20-row cap, the loop used to break
    before any Text Search query fired. We now run every text query so
    the sport-specific packs always contribute to the result set."""

    # Stub returns 20 distinct rows on every call so Nearby alone would
    # exceed any user limit. With the old early-exit code Text Search
    # never fired; the new code must dispatch all of them.
    def _payload(prefix: str) -> dict[str, Any]:
        return {
            "places": [
                {
                    "id": f"places/{prefix}-{i}",
                    "displayName": {"text": f"{prefix} {i}"},
                    "location": {"latitude": -33.89, "longitude": 151.27},
                    "types": ["sports_complex"],
                }
                for i in range(20)
            ]
        }

    call_count = 0

    async def _post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        url = args[0] if args else kwargs.get("url")
        if url == "https://places.googleapis.com/v1/places:searchNearby":
            return _ok_response(_payload("near"))
        return _ok_response(_payload(f"text{call_count}"))

    client = MagicMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(side_effect=_post)
    client.aclose = AsyncMock()

    await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        limit=20,
        api_key="x",
        http_client=client,
    )

    # tennis has 1 Nearby + 5 Text queries after the v1.1 pack expansion.
    # If the early-exit ever returns, this drops back to ~1.
    assert client.post.await_count >= 5, (
        f"expected fan-out of >=5 HTTP calls (1 Nearby + 5 Text), got {client.post.await_count}"
    )
    text_bodies = _text_query_calls(client)
    text_queries = {b["textQuery"] for b in text_bodies}
    assert {"tennis court", "tennis club", "tennis centre"} <= text_queries, (
        f"missing canonical tennis text queries: {text_queries}"
    )


@pytest.mark.asyncio
async def test_expanded_query_packs_include_spec_phrases() -> None:
    """Spec asks for richer per-sport phrase lists. Pin a few signature
    additions so a regression in `_SPORT_STRATEGIES` is caught fast."""
    sport_to_required_phrases = {
        "tennis": {"tennis centre", "tennis courts", "indoor tennis court"},
        "basketball": {
            "outdoor basketball court",
            "basketball stadium",
            "sports centre basketball court",
        },
        "badminton": {
            "sports hall badminton",
            "recreation centre badminton",
        },
        "soccer": {"futsal court", "soccer pitch", "indoor soccer court"},
        # Playable-facility shift: running drops "sports park" in favour
        # of "athletics field" + "sports oval" + "running trail".
        "running": {"park running trail", "athletics field", "sports oval"},
        "gym": {"fitness center", "training gym", "health club"},
        # Playable-phrase shift: golf queries drop the bare/indoor
        # variants and require the specific course / club / range /
        # mini / pitch-and-putt / putt putt phrases.
        "golf": {"golf club", "mini golf", "pitch and putt", "putt putt"},
    }
    for sport, required in sport_to_required_phrases.items():
        client = _make_client(_ok_response({"places": []}))
        await search_sport_places(
            sport=sport,
            lat=-33.89,
            lng=151.27,
            api_key="x",
            http_client=client,
        )
        text_bodies = _text_query_calls(client)
        phrases = {b["textQuery"] for b in text_bodies}
        missing = required - phrases
        assert not missing, f"sport={sport}: missing expanded query phrases {missing}; saw {phrases}"


@pytest.mark.asyncio
async def test_unknown_sport_with_q_uses_general_fallback() -> None:
    """An unsupported sport + a user-supplied free-text query must
    still incur a Places call AND fan out into the general fallback
    pack so the picker surfaces nearby parks / sports complexes /
    recreation centres alongside Google's interpretation of ``q``.
    Cost protection (no HTTP on unknown sport) only applies when no
    q is supplied — see ``test_unknown_sport_returns_empty_without_http``."""
    client = _make_client(_ok_response({"places": []}))
    out = await search_sport_places_v2(
        sport="pickleball",  # not in _SPORT_STRATEGIES
        lat=-33.89,
        lng=151.27,
        q="pickleball court",
        api_key="x",
        http_client=client,
    )
    assert out.status == "ok"

    # The user's literal q is dispatched as a text query.
    text_bodies = _text_query_calls(client)
    text_phrases = {b["textQuery"] for b in text_bodies}
    assert "pickleball court" in text_phrases

    # AND at least one general-fallback phrase fans out alongside it so
    # the picker isn't empty when Google has nothing for the literal q.
    fallback_phrases = {
        "sports complex",
        "sports centre",
        "recreation centre",
        "park",
        "stadium",
    }
    assert fallback_phrases & text_phrases, f"general fallback packs did not fire; saw text phrases {text_phrases}"

    # The fallback also runs a Nearby Search with generic types.
    nearby_bodies = _nearby_query_calls(client)
    assert nearby_bodies, "expected a Nearby Search from the general fallback"
    included = set(nearby_bodies[0]["includedTypes"])
    assert included & {"sports_complex", "stadium", "park"}, f"fallback Nearby missing generic types: {included}"


# ─── confidence classification ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_confidence_high_when_primary_type_matches_sport() -> None:
    """primary_type=='tennis_court' against sport='tennis' → high."""
    payload = {
        "places": [
            {
                "id": "places/HIGH",
                "displayName": {"text": "Anonymous Tennis Spot"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "primaryType": "tennis_court",
                "types": ["tennis_court", "sports_complex"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out and out[0].confidence == "high"


@pytest.mark.asyncio
async def test_confidence_high_via_name_match() -> None:
    """Even without a matching type, a name containing the sport keyword
    is enough to mark the row high-confidence."""
    payload = {
        "places": [
            {
                "id": "places/NAME",
                "displayName": {"text": "Marrickville Tennis Club"},
                "location": {"latitude": -33.91, "longitude": 151.16},
                "types": ["sports_club"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out and out[0].confidence == "high"


@pytest.mark.asyncio
async def test_generic_sports_complex_without_sport_signal_is_low_not_medium() -> None:
    """Codex follow-up: a generic ``sports_complex`` with no tennis-
    specific signal in name/types/address must classify as LOW, not
    medium. The previous design promoted generic infrastructure to
    medium because _STRONG_ALLOW_TYPES and _MEDIUM_CONFIDENCE_TYPES
    overlapped and both contributed points — falsely implying a
    confident sport match. Generic infra is plausibility-only now
    (sparse-area coverage) and caps at low without sport-specific
    evidence."""
    payload = {
        "places": [
            {
                "id": "places/GEN",
                "displayName": {"text": "Generic Sports Complex"},
                "location": {"latitude": -33.90, "longitude": 151.20},
                "primaryType": "sports_complex",
                "types": ["sports_complex"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out and out[0].confidence == "low"


@pytest.mark.asyncio
async def test_confidence_low_for_weak_but_plausible_venue() -> None:
    """A place tagged ``athletic_field`` for a sport without a sport-
    specific type signal classifies as low — weak match, but plausible
    enough to surface in sparse areas (athletic fields sometimes have
    courts for a different sport on site)."""
    payload = {
        "places": [
            {
                "id": "places/LOW",
                "displayName": {"text": "Wentworth Athletic Field"},
                "location": {"latitude": -33.895, "longitude": 151.27},
                "primaryType": "athletic_field",
                "types": ["athletic_field"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out and out[0].confidence == "low"


# ─── playable classifier — sport-aware reject ────────────────────────────────


@pytest.mark.asyncio
async def test_classifier_rejects_unrelated_business() -> None:
    """A cafe is not a playable tennis venue — it has no sport signal
    and no playable infrastructure type, so the classifier rejects it
    before it reaches mobile."""
    payload = {
        "places": [
            {
                "id": "places/CAFE",
                "displayName": {"text": "Cafe Next Door"},
                "location": {"latitude": -33.895, "longitude": 151.27},
                "primaryType": "cafe",
                "types": ["cafe", "food"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == [], f"expected cafe to be rejected as a tennis venue; got {[r.name for r in out]}"


@pytest.mark.asyncio
async def test_classifier_rejects_golf_pro_shop_by_keyword() -> None:
    """A golf pro shop is rejected by the per-sport reject keyword even
    if Google has tagged it with a sport-relevant type. This is the
    exact "Big Golf pro shop" case that motivated the classifier."""
    payload = {
        "places": [
            {
                "id": "places/GOLFSHOP",
                "displayName": {"text": "Big Golf Pro Shop"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "primaryType": "sports_complex",
                "types": ["sports_complex"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_classifier_rejects_retail_type_even_with_sport_keyword() -> None:
    """Generic sport keyword alone is not enough. "Big Golf" — Google
    tagged ``store`` — is rejected outright because the type is a hard
    retail signal. This pins the "Big Golf" regression."""
    payload = {
        "places": [
            {
                "id": "places/BIGGOLF",
                "displayName": {"text": "Big Golf"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "primaryType": "store",
                "types": ["store", "sporting_goods_store"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_classifier_rejects_bare_sport_keyword_without_signal() -> None:
    """A place named "Big Golf" with NO type and NO playable allow
    keyword is rejected on score=0. The bare sport word in a name is
    not, by itself, evidence of a playable venue."""
    payload = {
        "places": [
            {
                "id": "places/GENERIC",
                "displayName": {"text": "Big Golf"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "types": [],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_classifier_returns_golf_course_at_high_confidence() -> None:
    """A real golf course tagged ``golf_course`` survives the classifier
    and lands at high confidence."""
    payload = {
        "places": [
            {
                "id": "places/GC",
                "displayName": {"text": "Sydney Golf Course"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "primaryType": "golf_course",
                "types": ["golf_course"],
                "formattedAddress": "1 Fairway Ave, Sydney NSW",
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].name == "Sydney Golf Course"
    assert out[0].confidence == "high"


@pytest.mark.asyncio
async def test_classifier_rejects_tennis_shop() -> None:
    """Tennis pro shop / racquet stringing services are not playable."""
    payload = {
        "places": [
            {
                "id": "places/TENSHOP",
                "displayName": {"text": "City Tennis Pro Shop"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "primaryType": "store",
                "types": ["store"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_classifier_returns_tennis_court_venue() -> None:
    """A tennis court with primary_type=tennis_court is the playable
    case — survives the classifier at high confidence."""
    payload = {
        "places": [
            {
                "id": "places/COURT",
                "displayName": {"text": "Bondi Tennis Court"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "primaryType": "tennis_court",
                "types": ["tennis_court"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence == "high"


@pytest.mark.asyncio
async def test_classifier_rejects_basketball_apparel_store() -> None:
    """A basketball-branded apparel / shoe store is rejected by the
    shoe_store hard-reject type, not by the keyword path."""
    payload = {
        "places": [
            {
                "id": "places/BBSHOES",
                "displayName": {"text": "Hoops Basketball Shoes"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "primaryType": "shoe_store",
                "types": ["shoe_store", "clothing_store"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="basketball", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_classifier_rejects_gym_supplement_store() -> None:
    """A gym-supplement / nutrition shop / fitness equipment retailer
    is rejected even though "gym" / "fitness" wording appears in the
    name."""
    payload = {
        "places": [
            {
                "id": "places/SUPP",
                "displayName": {"text": "Premium Gym Supplement Store"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                # Google often tags these as a generic ``store``.
                "primaryType": "store",
                "types": ["store"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="gym", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_classifier_handles_missing_optional_fields_without_crashing() -> None:
    """A well-formed row missing all optional fields (no address, no
    primary_type, no types) must classify without raising. The result
    is "rejected" because there's no signal at all — but the function
    must not crash."""
    payload = {
        "places": [
            {
                "id": "places/MIN",
                "displayName": {"text": "Mystery Venue"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                # No types, no primaryType, no formattedAddress.
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_classifier_word_boundary_does_not_match_substring() -> None:
    """Single-word rejects like "shop" must NOT trigger on substrings
    like "workshop". Pins the regex \\b boundary behaviour the
    classifier relies on."""
    payload = {
        "places": [
            {
                "id": "places/WS",
                "displayName": {"text": "Marrickville Tennis Workshop Courts"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "primaryType": "tennis_court",
                "types": ["tennis_court"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    # "workshop" contains "shop" but is NOT a reject — the venue
    # survives because tennis_court signal is intact.
    assert len(out) == 1


@pytest.mark.asyncio
async def test_classifier_logs_rejection_with_sport_name_reason(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Every rejection emits a DEBUG-level log line with sport / name /
    reason fields so operators can investigate drops without paying
    info-level production log spam. Pins the log contract documented
    in runbook §10.5."""
    payload = {
        "places": [
            {
                "id": "places/STORE",
                "displayName": {"text": "Big Golf"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "primaryType": "store",
                "types": ["store"],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    caplog.set_level(logging.DEBUG, logger="app.services.places")
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []
    matching = [r for r in caplog.records if "places_playability_rejected" in r.getMessage()]
    assert matching, "expected at least one rejection log line"
    record = matching[0]
    assert record.levelno == logging.DEBUG, f"per-row rejection must log at DEBUG (was {record.levelname})"
    message = record.getMessage()
    assert "sport=golf" in message
    assert "Big Golf" in message
    # Reason naming: reject_type:<type> | reject_keyword:<kw> | score_too_low.
    assert "reject_type:store" in message


@pytest.mark.asyncio
async def test_classifier_allow_keyword_in_address_only_is_weak_signal() -> None:
    """A venue with ``"tennis court"`` only in its ADDRESS (not name)
    and no other signal lands at low — the address match is a +1
    signal, enough to clear rejection but not enough for high/medium."""
    payload = {
        "places": [
            {
                "id": "places/ADDR",
                "displayName": {"text": "Council Booking Office"},
                "location": {"latitude": -33.89, "longitude": 151.27},
                "formattedAddress": "12 Tennis Court Road, Bondi NSW",
                "types": [],
            }
        ]
    }
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence == "low"


# ─── Codex follow-up — playable golf variants + missing retail cases ────────


def _single_place_payload(
    *,
    name: str,
    primary_type: str | None = None,
    types: tuple[str, ...] = (),
    address: str | None = None,
) -> dict[str, Any]:
    """Build a single-row Places payload with the given fields.

    Optional fields default to absent so the classifier exercises its
    "missing optional field" path naturally — mirrors what Google
    sometimes returns for sparse rows.
    """
    place: dict[str, Any] = {
        "id": f"places/{name.upper().replace(' ', '_')}",
        "displayName": {"text": name},
        "location": {"latitude": -33.89, "longitude": 151.27},
    }
    if primary_type is not None:
        place["primaryType"] = primary_type
    if types:
        place["types"] = list(types)
    if address is not None:
        place["formattedAddress"] = address
    return {"places": [place]}


@pytest.mark.asyncio
async def test_golf_driving_range_is_returned_high() -> None:
    """A driving range with golf-specific name keyword survives the
    classifier at high confidence."""
    payload = _single_place_payload(
        name="Bondi Driving Range",
        primary_type="golf_course",
        types=("golf_course",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence == "high"


@pytest.mark.asyncio
async def test_golf_driving_range_without_type_is_at_least_medium() -> None:
    """A driving range with NO Google type still survives on the
    'driving range' allow keyword in the name — lands at medium."""
    payload = _single_place_payload(name="City Driving Range")
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.asyncio
async def test_mini_golf_is_returned() -> None:
    """Mini golf is a playable variant. ``mini golf`` is a sport-
    specific allow keyword."""
    payload = _single_place_payload(name="Centennial Mini Golf")
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.asyncio
async def test_pitch_and_putt_is_returned() -> None:
    """Pitch and putt is a playable variant. The full phrase is a
    sport-specific allow keyword."""
    payload = _single_place_payload(name="Bondi Pitch and Putt")
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.parametrize(
    "name",
    [
        "Golf Warehouse",
        "Golf Equipment",
        "Golf Fitting",
        "Club Fitting Centre",
    ],
)
@pytest.mark.asyncio
async def test_golf_retail_names_are_rejected(name: str) -> None:
    """The exact retail / equipment / fitting names called out in the
    Codex review are all rejected by the per-sport keyword path —
    independent of whatever Google type they happen to carry."""
    payload = _single_place_payload(
        name=name,
        # Deliberately NOT a reject type — exercises the keyword path,
        # not the type path. Sports_complex would otherwise grant a
        # generic infrastructure point; the reject keyword must still
        # win.
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == [], f"expected name={name!r} to be rejected as a golf venue"


@pytest.mark.asyncio
async def test_badminton_racquet_store_is_rejected() -> None:
    """Badminton racquet/equipment retailer — rejected on keyword
    path, NOT the type path (a sporting_goods_store / store type also
    rejects, but this test pins the keyword behaviour)."""
    payload = _single_place_payload(
        name="Sydney Racquet Store",
        # Misleading non-retail type so we test the keyword path.
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="badminton", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_running_shoe_store_is_rejected() -> None:
    """A running shoe / apparel retailer is rejected even if the name
    contains "Running" (bare sport keyword does not save it)."""
    payload = _single_place_payload(
        name="The Running Shoe Store",
        primary_type="store",
        types=("store",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="running", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_running_apparel_store_is_rejected_by_keyword_only() -> None:
    """Same intent as above but with a non-store Google type — the
    "apparel" keyword in the name must reject independently."""
    payload = _single_place_payload(
        name="Bondi Running Apparel",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="running", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.parametrize("sport", ["soccer", "football"])
@pytest.mark.asyncio
async def test_soccer_football_apparel_store_is_rejected(sport: str) -> None:
    """Soccer / football apparel + shoe retailers are rejected by the
    per-sport keyword path."""
    payload = _single_place_payload(
        name="World Soccer Apparel",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport=sport, lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.parametrize(
    "name, primary_type",
    [
        ("Generic Sports Complex", "sports_complex"),
        ("Anonymous Park", "park"),
        ("Wentworth Stadium", "stadium"),
        ("Civic Establishment", "establishment"),
        ("Local Point", "point_of_interest"),
    ],
)
@pytest.mark.asyncio
async def test_generic_infrastructure_is_rejected_for_golf(
    name: str,
    primary_type: str,
) -> None:
    """Codex follow-up: golf is intentionally stricter than the other
    sports. Generic infrastructure (sports_complex / park / stadium /
    establishment / point_of_interest) WITHOUT any golf-specific
    playable signal (golf_course type, "golf course"/"golf club"/
    "driving range"/"mini golf"/"pitch and putt"/"links"/"country club"
    in name or address) is rejected outright rather than surfaced as a
    misleading "low" match. Other sports still keep low-confidence
    generic infra for sparse-area coverage."""
    payload = _single_place_payload(name=name, primary_type=primary_type, types=(primary_type,))
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == [], (
        f"name={name!r} primary_type={primary_type!r} should be rejected "
        f"for golf, got {[(r.name, r.confidence) for r in out]}"
    )


@pytest.mark.asyncio
async def test_big_golf_with_sports_complex_type_is_rejected() -> None:
    """Codex follow-up — even if Google mistags a "Big Golf" pro shop as
    ``sports_complex``, the strict golf policy rejects it because there
    is NO golf-specific playable signal (no "course"/"club"/"range"/
    "mini golf"/"pitch and putt"/"links" in the name, no golf_course
    type, no allow keyword in the address). The previous behaviour
    surfaced it at "low"; that was misleading for a sport with sparse
    but unmistakable venue terminology."""
    payload = _single_place_payload(
        name="Big Golf",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == [], (
        f"Big Golf without golf-specific signal must be rejected under "
        f"strict golf policy; got {[(r.name, r.confidence) for r in out]}"
    )


@pytest.mark.asyncio
async def test_strict_golf_policy_does_not_apply_to_other_sports() -> None:
    """The strict reject-generic-infra rule is intentionally golf-only.
    For basketball / running / badminton (sparse venue density), a
    generic sports_complex without sport-specific signal still surfaces
    at "low" so coverage doesn't disappear in suburbs/regional areas."""
    payload = _single_place_payload(
        name="Generic Sports Complex",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="basketball", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence == "low"


# ─── Playable-facility-only strategy — round 2 ──────────────────────────────


@pytest.mark.asyncio
async def test_plain_golf_name_with_non_playable_type_is_rejected() -> None:
    """A place literally named "Golf" with no golf-specific playable
    signal in name (no "course"/"club"/"range"/"links") AND a non-
    playable Google type must NOT score as playable. The bare sport
    word in a name is not, by itself, evidence."""
    payload = _single_place_payload(
        name="Golf",
        primary_type="cafe",
        types=("cafe", "food"),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    # cafe is not in _REJECT_TYPES, no reject keyword in name "golf",
    # no golf allow keyword in name → score 0 → rejected.
    assert out == []


@pytest.mark.asyncio
async def test_soccer_field_returned() -> None:
    """A real soccer field with allow keyword in name survives."""
    payload = _single_place_payload(
        name="Marrickville Soccer Field",
        primary_type="athletic_field",
        types=("athletic_field",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="soccer", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.asyncio
async def test_football_pitch_returned() -> None:
    """A real football pitch with allow keyword in name survives."""
    payload = _single_place_payload(
        name="Bondi Football Pitch",
        primary_type="athletic_field",
        types=("athletic_field",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="football", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.parametrize(
    "sport, name",
    [
        ("soccer", "Sydney Soccer Apparel Store"),
        ("football", "Sydney Football Boots Store"),
    ],
)
@pytest.mark.asyncio
async def test_soccer_football_retail_store_rejected(
    sport: str,
    name: str,
) -> None:
    """Soccer / football retail (apparel / boot / shop / store) is
    rejected by global retail keywords even when Google tags it with
    a non-store type."""
    payload = _single_place_payload(
        name=name,
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport=sport, lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_basketball_court_returned() -> None:
    """A real basketball court survives the playable classifier at high
    confidence (sport-specific type + allow keyword in name)."""
    payload = _single_place_payload(
        name="Wentworth Outdoor Basketball Court",
        primary_type="basketball_court",
        types=("basketball_court",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="basketball", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence == "high"


@pytest.mark.asyncio
async def test_tennis_stringing_shop_rejected() -> None:
    """Tennis racquet stringing services are rejected by the per-sport
    "stringing" reject keyword."""
    payload = _single_place_payload(
        name="Bondi Racquet Stringing",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == []


@pytest.mark.asyncio
async def test_running_track_returned() -> None:
    """A real running track survives."""
    payload = _single_place_payload(
        name="Sydney Running Track",
        primary_type="athletic_field",
        types=("athletic_field",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="running", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.parametrize(
    "sport, name",
    [
        # Cross-sport "warehouse" reject — used to require a per-sport
        # entry; now a global reject so any sport's search catches it.
        ("tennis", "Tennis Warehouse"),
        ("badminton", "Badminton Warehouse"),
        ("running", "Running Warehouse"),
        # Cross-sport "supplement" reject — used to be gym-only.
        ("running", "Sydney Supplement Hub"),
        # Cross-sport "fitting" reject — covers "club fitting" for
        # golf AND any other sport's fitting business.
        ("tennis", "Pro Fitting Studio"),
    ],
)
@pytest.mark.asyncio
async def test_global_retail_keywords_reject_across_sports(
    sport: str,
    name: str,
) -> None:
    """Global retail markers (warehouse / supplement / fitting / …)
    apply regardless of which sport the request came from."""
    payload = _single_place_payload(
        name=name,
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport=sport, lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == [], f"sport={sport} name={name!r} should be rejected"


@pytest.mark.asyncio
async def test_classifier_does_not_crash_on_all_optional_fields_missing() -> None:
    """A bare-minimum Places payload (id + displayName + location only)
    must classify without raising. Result depends on the sport: with no
    signals at all the row is rejected, but the function must not
    crash."""
    payload = _single_place_payload(name="Nameless Spot")
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="soccer", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    # No crash. Empty result is fine — the point is the call returns.
    assert isinstance(out, list)


# ─── Codex follow-up — bare-q guard & coverage tests ────────────────────────


@pytest.mark.parametrize(
    "bare_q",
    [
        "golf",
        "GOLF",
        "  golf  ",
        "Golf",
    ],
)
@pytest.mark.asyncio
async def test_bare_q_golf_does_not_trigger_keyword_search(bare_q: str) -> None:
    """Codex follow-up — explicit q='golf' (any casing/whitespace) must
    be replaced with the golf playable pack. The bare keyword would
    otherwise hit Text Search once for the word "golf" and pull retail
    / pro shop rows. The guard drops the bare q so the normal fan-out
    fires: 1 Nearby Search on (golf_course, indoor_golf_course) + every
    playable text query (golf course, golf club, driving range, …).
    Bare "golf" must NEVER appear as a textQuery on the wire."""
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places_v2(
        sport="golf",
        lat=-33.89,
        lng=151.27,
        q=bare_q,
        api_key="x",
        http_client=client,
    )
    nearby_bodies = _nearby_query_calls(client)
    assert nearby_bodies, (
        "bare q='golf' must NOT short-circuit to a single Text Search — "
        "the golf playable pack (including Nearby Search on "
        "golf_course / indoor_golf_course) must still fire"
    )
    included = set(nearby_bodies[0]["includedTypes"])
    assert "golf_course" in included
    text_phrases = {b["textQuery"] for b in _text_query_calls(client)}
    assert "golf course" in text_phrases
    assert "driving range" in text_phrases
    assert "mini golf" in text_phrases
    # The bare sport word must NEVER be sent as a textQuery — that's the
    # exact false-positive the guard is preventing.
    assert "golf" not in text_phrases, f"bare 'golf' must not be dispatched as a Text Search; saw {text_phrases}"


@pytest.mark.parametrize(
    "bare_q",
    ["soccer", "SOCCER", "Soccer"],
)
@pytest.mark.asyncio
async def test_bare_q_soccer_uses_playable_field_pitch_futsal_pack(
    bare_q: str,
) -> None:
    """Codex follow-up — q='soccer' is replaced with the soccer playable
    pack so the fan-out hits soccer field / football field / football
    pitch / soccer pitch / futsal court / indoor soccer court rather
    than a bare keyword search. Bare "soccer" must NEVER appear on the
    wire as a textQuery."""
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places_v2(
        sport="soccer",
        lat=-33.89,
        lng=151.27,
        q=bare_q,
        api_key="x",
        http_client=client,
    )
    text_phrases = {b["textQuery"] for b in _text_query_calls(client)}
    # The expanded soccer playable pack must still fire.
    expected = {"soccer field", "football pitch", "futsal court"}
    missing = expected - text_phrases
    assert not missing, f"bare q='soccer' should trigger soccer playable pack; missing {missing}"
    assert "soccer" not in text_phrases, f"bare 'soccer' must not be sent as a Text Search; saw {text_phrases}"
    # Nearby Search still fires with soccer types.
    nearby_bodies = _nearby_query_calls(client)
    assert nearby_bodies, "Nearby Search must still fire under the bare-q guard"


@pytest.mark.asyncio
async def test_specific_q_with_facility_words_is_not_dropped() -> None:
    """The guard only kicks in for EXACT bare sport keywords. A specific
    q like 'driving range' or 'Moore Park Golf Course' must be forwarded
    to Google Places unchanged."""
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places_v2(
        sport="golf",
        lat=-33.89,
        lng=151.27,
        q="Moore Park Golf Course",
        api_key="x",
        http_client=client,
    )
    text_phrases = {b["textQuery"] for b in _text_query_calls(client)}
    assert "Moore Park Golf Course" in text_phrases, f"specific q must be forwarded unchanged; saw {text_phrases}"


@pytest.mark.asyncio
async def test_futsal_court_returned() -> None:
    """A futsal court survives the playable classifier — futsal court is
    in the soccer/football allow-keyword pack."""
    payload = _single_place_payload(
        name="Marrickville Futsal Court",
        primary_type="athletic_field",
        types=("athletic_field",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="soccer", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.asyncio
async def test_badminton_court_returned() -> None:
    """A real badminton court survives at high confidence (sport-
    specific badminton_court type + 'badminton court' allow keyword)."""
    payload = _single_place_payload(
        name="Sydney Badminton Court",
        primary_type="badminton_court",
        types=("badminton_court",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="badminton", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence == "high"


@pytest.mark.asyncio
async def test_badminton_centre_returned() -> None:
    """A 'badminton centre' venue survives — allow keyword 'badminton
    centre' is in the badminton pack."""
    payload = _single_place_payload(
        name="Hurstville Badminton Centre",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="badminton", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.asyncio
async def test_badminton_sports_hall_returned() -> None:
    """A 'sports hall' venue with sport=badminton survives — 'sports
    hall' is in the badminton allow-keyword pack (council-run halls
    typically host badminton)."""
    payload = _single_place_payload(
        name="Wentworth Sports Hall",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="badminton", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.asyncio
async def test_gym_returned() -> None:
    """A gym with primary_type=gym survives at high confidence."""
    payload = _single_place_payload(
        name="Anytime Gym Sydney",
        primary_type="gym",
        types=("gym",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="gym", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence == "high"


@pytest.mark.asyncio
async def test_fitness_centre_returned() -> None:
    """A 'Fitness Centre' venue survives the playable classifier —
    'fitness centre' is in the gym allow-keyword pack."""
    payload = _single_place_payload(
        name="Bondi Fitness Centre",
        primary_type="fitness_center",
        types=("fitness_center",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="gym", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.parametrize(
    "name, primary_type",
    [
        ("Centennial Running Trail", "park"),
        ("Wentworth Park Oval", "park"),
        ("Centennial Park", "city_park"),
    ],
)
@pytest.mark.asyncio
async def test_running_trail_oval_park_returned(
    name: str,
    primary_type: str,
) -> None:
    """Running has the loosest allow-keyword pack (trail / oval / park /
    track / running track / athletics track). Parks and ovals around
    Sydney commonly host running loops; these survive the classifier."""
    payload = _single_place_payload(name=name, primary_type=primary_type, types=(primary_type,))
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="running", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1, f"running venue name={name!r} must not be rejected; got {out}"


@pytest.mark.asyncio
async def test_basketball_apparel_rejected_with_non_retail_type() -> None:
    """Codex follow-up — a basketball apparel store with a non-retail
    Google type (sports_complex / establishment) must still be rejected
    by the global 'apparel' keyword. Pins the keyword path independent
    of the hard-reject-type path."""
    payload = _single_place_payload(
        name="Hoops Basketball Apparel",
        # Misleading non-retail type — the keyword reject must still win.
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="basketball", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == [], f"basketball apparel must be rejected regardless of Google type; got {out}"


# ─── Codex follow-up — golf coverage / smoke-fix tests ──────────────────────


def _make_routed_client(
    *,
    nearby_payload: dict[str, Any] | None = None,
    text_payload: dict[str, Any] | None = None,
) -> MagicMock:
    """Build a mock httpx.AsyncClient that routes by URL.

    Nearby Search and Text Search return DIFFERENT payloads. Lets a
    test exercise the matched-query path: a row that only surfaces via
    Text Search (and therefore carries "text:<query>" origin) vs a row
    that only surfaces via Nearby (and carries "nearby:<types>" origin)."""

    async def _post(*args: Any, **kwargs: Any) -> MagicMock:
        url = args[0] if args else kwargs.get("url")
        if isinstance(url, str) and "searchNearby" in url:
            return _ok_response(nearby_payload or {"places": []})
        if isinstance(url, str) and "searchText" in url:
            return _ok_response(text_payload or {"places": []})
        return _ok_response({"places": []})

    client = MagicMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(side_effect=_post)
    client.aclose = AsyncMock()
    return client


@pytest.mark.asyncio
async def test_golf_indoor_golf_course_type_survives() -> None:
    """A venue Google has tagged ``indoor_golf_course`` survives at
    high confidence — the type is in ``_SPORT_TYPE_SIGNALS["golf"]``."""
    payload = _single_place_payload(
        name="Sydney Indoor Golf",
        primary_type="indoor_golf_course",
        types=("indoor_golf_course",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence == "high"


@pytest.mark.asyncio
async def test_golf_club_name_survives_without_golf_type() -> None:
    """A venue named with "Golf Club" but tagged only as sports_complex
    survives on the name allow-keyword path. Pins the case where Google
    doesn't tag golf clubs as ``golf_course`` — the keyword does."""
    payload = _single_place_payload(
        name="Bonnie Doon Golf Club",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1
    assert out[0].confidence in {"high", "medium"}


@pytest.mark.asyncio
async def test_golf_something_establishment_is_rejected() -> None:
    """Codex follow-up — a row with the bare sport word in name but no
    playable keyword ("golf course" / "club" / "range" / "mini golf" /
    "links" / "country club" / "course") and only an ``establishment``
    type is rejected. Bare "Golf" is not, by itself, evidence of a
    playable golf venue."""
    payload = _single_place_payload(
        name="Golf Something",
        primary_type="establishment",
        types=("establishment",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == [], f"generic 'Golf Something' establishment with no playable signal must be rejected; got {out}"


@pytest.mark.asyncio
async def test_golf_pro_shop_rejected_even_with_q_golf_course() -> None:
    """Codex follow-up — explicit q='golf course' (a playable query)
    must NOT override retail rejection. A "Big Golf Pro Shop" with a
    misleading sports_complex type is still rejected on the per-sport
    "pro shop" keyword path. Query intent ≠ trust the row."""
    payload = _single_place_payload(
        name="Big Golf Pro Shop",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places_v2(
        sport="golf",
        lat=-33.89,
        lng=151.27,
        q="golf course",
        api_key="x",
        http_client=client,
    )
    assert out.results == [], f"Big Golf Pro Shop must be rejected even when q='golf course'; got {out.results}"


@pytest.mark.asyncio
async def test_golf_store_type_rejected_even_with_q_golf_course() -> None:
    """Codex follow-up — a hard-reject type (``store``) overrides
    explicit q intent. q='golf course' must not bring a retail row
    through the classifier."""
    payload = _single_place_payload(
        name="Big Golf",
        primary_type="store",
        types=("store",),
    )
    client = _make_client(_ok_response(payload))
    out = await search_sport_places_v2(
        sport="golf",
        lat=-33.89,
        lng=151.27,
        q="golf course",
        api_key="x",
        http_client=client,
    )
    assert out.results == [], f"store-type Big Golf must be rejected even when q='golf course'; got {out.results}"


@pytest.mark.asyncio
async def test_golf_concord_style_survives_via_text_query_origin() -> None:
    """Codex smoke-fix — a real Sydney golf venue that Google returns
    via Text Search "golf course" (but DOESN'T tag with golf_course
    type and DOESN'T return via Nearby) must survive at LOW confidence.

    This pins the "query intent" branch: the row matched a specific
    playable phrase (Google's keyword matcher believes "Concord Golf"
    is relevant to "golf course"); without this branch the strict
    golf policy would reject it and the picker would show zero golf
    rows for whole swathes of Sydney.

    Routed mock: Nearby returns empty, Text returns the row → the row
    only carries "text:golf course" origin (not "nearby:...").
    """
    row_payload = _single_place_payload(
        name="Concord Golf",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_routed_client(
        nearby_payload={"places": []},
        text_payload=row_payload,
    )
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert len(out) == 1, (
        f"row that surfaced only via Text Search 'golf course' must be kept at low confidence; got {out}"
    )
    assert out[0].confidence == "low"


@pytest.mark.asyncio
async def test_golf_big_golf_rejected_with_nearby_only_origin() -> None:
    """Inverse of the test above — when the row surfaces ONLY via
    Nearby Search (no playable Text Search query brought it in) the
    strict golf policy still rejects. Pins the "Big Golf with
    sports_complex and no query/address/type playable signal" case
    from the spec.

    Routed mock: Nearby returns the row, Text returns empty → the row
    only carries "nearby:..." origin.
    """
    row_payload = _single_place_payload(
        name="Big Golf",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_routed_client(
        nearby_payload=row_payload,
        text_payload={"places": []},
    )
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == [], (
        f"Big Golf with only Nearby origin (no playable query signal) "
        f"must be rejected; got {[(r.name, r.confidence) for r in out]}"
    )


@pytest.mark.asyncio
async def test_golf_retail_keyword_rejected_via_text_query_origin() -> None:
    """Even when the row surfaces via Text Search 'golf course' (i.e.
    has playable query intent), retail markers in the NAME still win.
    Pins the "query intent does not override reject" rule."""
    row_payload = _single_place_payload(
        name="Big Golf Warehouse",
        primary_type="sports_complex",
        types=("sports_complex",),
    )
    client = _make_routed_client(
        nearby_payload={"places": []},
        text_payload=row_payload,
    )
    out = await search_sport_places(sport="golf", lat=-33.89, lng=151.27, api_key="x", http_client=client)
    assert out == [], (
        f"golf warehouse must be rejected via the global 'warehouse' "
        f"keyword even when query origin is playable; got {out}"
    )
