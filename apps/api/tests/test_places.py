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

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.services import places as places_module
from app.services.places import PlaceResult, search_sport_places


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


@pytest.mark.parametrize(
    "sport, expected_text",
    [
        ("tennis", "tennis court"),
        ("basketball", "basketball court"),
        ("badminton", "badminton court"),
        ("soccer", "soccer field"),
        ("football", "soccer field"),  # football aliases onto soccer
        ("running", "running track"),
    ],
)
@pytest.mark.asyncio
async def test_text_query_sports_send_searchtext_with_keyword(
    sport: str, expected_text: str
) -> None:
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places(
        sport=sport,
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert client.post.await_count == 1
    args, kwargs = client.post.call_args
    url = args[0] if args else kwargs.get("url")
    assert url == "https://places.googleapis.com/v1/places:searchText"
    body = kwargs["json"]
    assert body["textQuery"] == expected_text
    # text path uses locationBias (not locationRestriction).
    assert "locationBias" in body
    assert "locationRestriction" not in body


@pytest.mark.parametrize(
    "sport, included_type",
    [
        ("golf", "golf_course"),
        ("gym", "gym"),
    ],
)
@pytest.mark.asyncio
async def test_type_mapped_sports_send_searchnearby_with_included_type(
    sport: str, included_type: str
) -> None:
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places(
        sport=sport,
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    args, kwargs = client.post.call_args
    url = args[0] if args else kwargs.get("url")
    assert url == "https://places.googleapis.com/v1/places:searchNearby"
    body = kwargs["json"]
    assert body["includedTypes"] == [included_type]
    assert "locationRestriction" in body
    assert "locationBias" not in body


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
    client = _make_client(_ok_response({"places": []}))
    await search_sport_places(
        sport="TENNIS",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    args, kwargs = client.post.call_args
    assert kwargs["json"]["textQuery"] == "tennis court"


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
    client = _make_client(_ok_response(_sample_places_payload()))
    first = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    second = await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        api_key="x",
        http_client=client,
    )
    assert first == second
    assert client.post.await_count == 1, "second call should hit the in-process cache"


@pytest.mark.asyncio
async def test_cache_misses_when_sport_differs() -> None:
    client = _make_client(_ok_response(_sample_places_payload()))
    await search_sport_places(
        sport="tennis", lat=-33.89, lng=151.27, api_key="x", http_client=client
    )
    await search_sport_places(
        sport="basketball", lat=-33.89, lng=151.27, api_key="x", http_client=client
    )
    assert client.post.await_count == 2


@pytest.mark.asyncio
async def test_cache_collapses_lat_lng_to_2dp() -> None:
    # 600m apart at Sydney latitude both round to (-33.89, 151.27) at 2 d.p.
    client = _make_client(_ok_response(_sample_places_payload()))
    await search_sport_places(
        sport="tennis", lat=-33.891, lng=151.271, api_key="x", http_client=client
    )
    await search_sport_places(
        sport="tennis", lat=-33.886, lng=151.273, api_key="x", http_client=client
    )
    assert client.post.await_count == 1


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
    await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        radius_km=50.0,
        api_key="x",
        http_client=client,
    )
    assert client.post.await_count == 2


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
    _args, kwargs = client.post.call_args
    circle = kwargs["json"]["locationBias"]["circle"]
    assert circle["radius"] == 50_000
    assert circle["center"] == {"latitude": -33.89, "longitude": 151.27}


@pytest.mark.asyncio
async def test_max_result_count_clamped_to_places_cap() -> None:
    client = _make_client(_ok_response({"places": []}))
    # Above Places' 20-row hard cap; helper must clamp without erroring.
    await search_sport_places(
        sport="tennis",
        lat=-33.89,
        lng=151.27,
        limit=200,
        api_key="x",
        http_client=client,
    )
    _args, kwargs = client.post.call_args
    assert kwargs["json"]["maxResultCount"] == 20
