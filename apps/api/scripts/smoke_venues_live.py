"""Live /venues/nearby backend smoke test for Google Places integration.

Hits an authenticated staging / production FastAPI deployment and
exercises the real venue search code path end-to-end -- including the
server-side Google Places (New) provider -- to confirm
GOOGLE_PLACES_API_KEY is wired, quotas are healthy, and source modes
return what mobile expects. Mobile is not involved; this is a
backend-only contract test.

Run staging first. Production is a separate explicit step.

Bearer token comes from the SPORTSGANG_SMOKE_TOKEN environment variable by
default (preferred -- shell history / process listings don't leak the
value). ``--token`` is supported as an override but discouraged.

GOOGLE_PLACES_API_KEY lives on the backend. This script never sees,
sends, or prints it.

This is a PAID code path: each /venues/nearby request with
source=places or source=both can fire one or more Google Places (New)
SKU billable calls server-side. Use ``--dry-run`` first; use
``--sports`` / ``--locations`` / ``--max-calls`` to scope a probe.
See docs/runbooks/venues.md for safe defaults.

Exits non-zero on any of:
  * any unexpected HTTP >= 400 from /venues/nearby (i.e. anywhere the
    contract does not explicitly tolerate a 4xx),
  * any unexpected transport failure after retries,
  * ``source=places`` without coords NOT returning the documented
    {200, "missing_coordinates", items=[]} shape,
  * invalid cursor returning 5xx or anything other than the documented
    {200, "error", next_cursor=null} shape,
  * ``source=places`` with coords returning ``provider_status`` in
    {disabled, error, quota_exceeded},
  * more than half of (sport x Sydney-location x radius) combinations
    under ``source=places`` returning zero ``google_places`` rows,
  * any ``source=both`` cursor follow-up page leaking a ``seed`` row.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# Static matrix
# ---------------------------------------------------------------------------

LOCATIONS: dict[str, tuple[float, float]] = {
    # Greater Sydney coverage: inner ring, eastern beach, western edge.
    # Picked so radius_km=10 vs 50 changes the answer meaningfully on
    # at least one location.
    "usyd": (-33.8886, 151.1873),
    "bondi": (-33.8915, 151.2767),
    "parramatta": (-33.8136, 151.0034),
}
SPORTS: list[str] = [
    "tennis",
    "gym",
    "golf",
    "running",
    "basketball",
    "badminton",
    "soccer",
]
RADII: list[int] = [10, 50]
COORD_SOURCES: list[str] = ["places", "both"]

# Per-request HTTP timeout. Generous because the live provider fan-out
# (Nearby + Text Search) can take a couple of seconds on a cold cache.
_TIMEOUT_S: float = 15.0
# Retry only on transient 5xx / transport -- never on 4xx (those are
# real contract failures the smoke must surface).
_MAX_RETRIES: int = 3
_BACKOFF_SECONDS: tuple[float, ...] = (0.5, 1.5, 3.5)
# Default cap on cursor follow-up requests per run (~ one per sport).
_DEFAULT_MAX_CURSORS: int = 7
# Default upper bound on total live HTTP calls. Above this, refuse to
# start without an explicit --max-calls override. Computed as the
# baseline shape: 7 baseline_seed + 7 no_coords + 1 invalid_cursor +
# 7*3*2*2 matrix + 7 cursor follow-ups = 99. Set 120 to leave headroom
# for retries.
_DEFAULT_MAX_CALLS: int = 120


# ---------------------------------------------------------------------------
# Scenarios -- distinguish positive vs explicitly negative tests
# ---------------------------------------------------------------------------


SCENARIO_BASELINE_SEED = "baseline_seed"
SCENARIO_PLACES_NO_COORDS = "places_no_coords"
SCENARIO_INVALID_CURSOR = "invalid_cursor"
SCENARIO_MATRIX = "matrix"
SCENARIO_CURSOR_FOLLOWUP = "cursor_followup"

_EXPECTED_NEGATIVE = {SCENARIO_PLACES_NO_COORDS, SCENARIO_INVALID_CURSOR}


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------


@dataclass
class PlannedCall:
    """One planned /venues/nearby invocation in execution order."""

    scenario: str
    sport: str
    location: str | None
    lat: float | None
    lng: float | None
    radius_km: float | None
    source: str | None
    q: str | None = None
    cursor: str | None = None
    # For cursor follow-ups: set of (id) seen on the first page so the
    # executor can compute repeated_id_count. None for non-followup calls.
    first_page_ids: frozenset[str] | None = None


@dataclass
class Row:
    """One result row in the smoke output. Mirrors the spec verbatim
    plus the relevance-tuning fields requested by the reviewer.
    """

    scenario: str
    sport: str
    location: str | None
    lat: float | None
    lng: float | None
    radius_km: float | None
    source: str
    q: str | None
    cursor_used: bool
    http_status: int | None
    provider_status: str | None
    total: int | None
    items_count: int | None
    google_places_count: int | None
    seed_count: int | None
    next_cursor_exists: bool
    top_5_names: list[str] = field(default_factory=list)
    top_5_sources: list[str] = field(default_factory=list)
    top_5_distance_km: list[float | None] = field(default_factory=list)
    top_5_provider_place_ids: list[str | None] = field(default_factory=list)
    top_5_addresses: list[str | None] = field(default_factory=list)
    top_5_primary_types: list[str | None] = field(default_factory=list)
    top_5_types: list[list[str]] = field(default_factory=list)
    top_5_google_maps_uri_present: list[bool] = field(default_factory=list)
    top_5_attribution_required: list[bool] = field(default_factory=list)
    duplicate_id_count: int | None = None
    repeated_id_count: int | None = None
    max_distance_km: float | None = None
    error: str | None = None
    elapsed_ms: int | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _redact(message: str, token: str | None = None) -> str:
    """Best-effort scrub of bearer tokens out of any error string."""

    out = message.replace("Bearer ", "Bearer <redacted>")
    if token:
        # Direct token substring -- belt-and-braces if it ever appears
        # without the "Bearer " prefix (shouldn't, but cheap guard).
        out = out.replace(token, "<redacted>")
    return out


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _safe_str(value: Any) -> str | None:
    return value if isinstance(value, str) else None


def _populate_row_from_body(row: Row, body: dict[str, Any]) -> None:
    items: list[dict[str, Any]] = [it for it in (body.get("items") or []) if isinstance(it, dict)]
    row.provider_status = _safe_str(body.get("provider_status"))
    row.total = body.get("total") if isinstance(body.get("total"), int) else None
    row.items_count = len(items)
    row.google_places_count = sum(1 for it in items if it.get("source") == "google_places")
    row.seed_count = sum(1 for it in items if it.get("source") == "seed")
    row.next_cursor_exists = bool(body.get("next_cursor"))

    top = items[:5]
    row.top_5_names = [str(it.get("name")) for it in top]
    row.top_5_sources = [str(it.get("source")) for it in top]
    row.top_5_distance_km = [_coerce_float(it.get("distance_km")) for it in top]
    row.top_5_provider_place_ids = [_safe_str(it.get("provider_place_id")) for it in top]
    row.top_5_addresses = [_safe_str(it.get("address")) for it in top]
    row.top_5_primary_types = [_safe_str(it.get("primary_type")) for it in top]
    row.top_5_types = [[t for t in (it.get("types") or []) if isinstance(t, str)] for it in top]
    row.top_5_google_maps_uri_present = [bool(it.get("google_maps_uri")) for it in top]
    row.top_5_attribution_required = [bool(it.get("attribution_required")) for it in top]

    # All-row diagnostics (not just top 5).
    distances = [
        _coerce_float(it.get("distance_km")) for it in items if _coerce_float(it.get("distance_km")) is not None
    ]
    row.max_distance_km = max(distances) if distances else None
    ids = [str(it.get("id")) for it in items if isinstance(it.get("id"), str)]
    row.duplicate_id_count = len(ids) - len(set(ids)) if ids else 0


# ---------------------------------------------------------------------------
# HTTP call
# ---------------------------------------------------------------------------


def _execute(
    client: httpx.Client,
    base_url: str,
    token: str,
    call: PlannedCall,
) -> tuple[Row, dict[str, Any] | None]:
    """Run one PlannedCall. Returns (Row, body) for follow-up steps."""

    params: dict[str, Any] = {"sport": call.sport}
    if call.lat is not None:
        params["lat"] = call.lat
    if call.lng is not None:
        params["lng"] = call.lng
    if call.radius_km is not None:
        params["radius_km"] = call.radius_km
    if call.source is not None:
        params["source"] = call.source
    if call.q is not None:
        params["q"] = call.q
    if call.cursor is not None:
        params["cursor"] = call.cursor

    row = Row(
        scenario=call.scenario,
        sport=call.sport,
        location=call.location,
        lat=call.lat,
        lng=call.lng,
        radius_km=call.radius_km,
        source=call.source or "seed",
        q=call.q,
        cursor_used=call.cursor is not None,
        http_status=None,
        provider_status=None,
        total=None,
        items_count=None,
        google_places_count=None,
        seed_count=None,
        next_cursor_exists=False,
    )

    headers = {"Authorization": f"Bearer {token}"}
    start = time.monotonic()
    response: httpx.Response | None = None
    last_transport_error: str | None = None

    for attempt in range(_MAX_RETRIES):
        try:
            response = client.get(
                f"{base_url}/venues/nearby",
                params=params,
                headers=headers,
                timeout=_TIMEOUT_S,
            )
        except (httpx.TimeoutException, httpx.HTTPError) as exc:
            last_transport_error = _redact(f"transport: {type(exc).__name__}: {exc}", token=token)
            if attempt + 1 < _MAX_RETRIES:
                time.sleep(_BACKOFF_SECONDS[attempt])
                continue
            row.error = last_transport_error
            row.elapsed_ms = int((time.monotonic() - start) * 1000)
            return row, None

        if response.status_code >= 500 and attempt + 1 < _MAX_RETRIES:
            # Transient upstream -- back off and try again. We do NOT
            # retry 4xx (real contract failures).
            time.sleep(_BACKOFF_SECONDS[attempt])
            continue
        break

    row.elapsed_ms = int((time.monotonic() - start) * 1000)
    assert response is not None  # loop guarantees at least one assignment
    row.http_status = response.status_code

    parsed: Any
    try:
        parsed = response.json()
    except ValueError:
        row.error = f"non-json body status={response.status_code}"
        return row, None
    body: dict[str, Any] | None = parsed if isinstance(parsed, dict) else None

    if response.status_code >= 400:
        detail = body.get("detail") if body else None
        row.error = _redact(f"http {response.status_code}: {detail!r}", token=token)
        return row, body

    if body is None:
        row.error = "non-dict body"
        return row, None

    _populate_row_from_body(row, body)

    # Cursor follow-up: compute repeated_id_count against the first-page
    # IDs the planner stashed.
    if call.first_page_ids is not None:
        items: list[dict[str, Any]] = [it for it in (body.get("items") or []) if isinstance(it, dict)]
        page_ids = {str(it.get("id")) for it in items if isinstance(it.get("id"), str)}
        row.repeated_id_count = len(page_ids & call.first_page_ids)

    return row, body


# ---------------------------------------------------------------------------
# Plan builder
# ---------------------------------------------------------------------------


def _build_static_plan(
    *,
    sports: list[str],
    locations: dict[str, tuple[float, float]],
    radii: list[int],
    sources: list[str],
) -> list[PlannedCall]:
    """Plan everything except cursor follow-ups (those are discovered
    at runtime from matrix responses).
    """

    plan: list[PlannedCall] = []

    # 1. source=seed baseline -- no Places call expected.
    for sport in sports:
        plan.append(
            PlannedCall(
                scenario=SCENARIO_BASELINE_SEED,
                sport=sport,
                location=None,
                lat=None,
                lng=None,
                radius_km=None,
                source="seed",
            )
        )

    # 2. source=places without coords -- must return missing_coordinates.
    for sport in sports:
        plan.append(
            PlannedCall(
                scenario=SCENARIO_PLACES_NO_COORDS,
                sport=sport,
                location=None,
                lat=None,
                lng=None,
                radius_km=None,
                source="places",
            )
        )

    # 3. Invalid cursor -- must not 5xx, must return provider_status=error.
    if sports and locations:
        anchor_sport = sports[0]
        anchor_name, (anchor_lat, anchor_lng) = next(iter(locations.items()))
        plan.append(
            PlannedCall(
                scenario=SCENARIO_INVALID_CURSOR,
                sport=anchor_sport,
                location=anchor_name,
                lat=anchor_lat,
                lng=anchor_lng,
                radius_km=10,
                source="both",
                cursor="!!!not-base64!!!",
            )
        )

    # 4. Main matrix -- sport x location x radius x source.
    for location, (lat, lng) in locations.items():
        for sport in sports:
            for radius_km in radii:
                for source in sources:
                    plan.append(
                        PlannedCall(
                            scenario=SCENARIO_MATRIX,
                            sport=sport,
                            location=location,
                            lat=lat,
                            lng=lng,
                            radius_km=float(radius_km),
                            source=source,
                        )
                    )

    return plan


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


def _run(
    *,
    base_url: str,
    token: str,
    plan: list[PlannedCall],
    max_cursors: int,
) -> list[Row]:
    rows: list[Row] = []
    # Track which sports we've already covered with a cursor follow-up
    # so the budget spreads across sports rather than burning all on one.
    cursor_followups_done = 0
    sports_with_followup: set[str] = set()
    cursor_candidates: list[tuple[PlannedCall, frozenset[str]]] = []

    with httpx.Client() as client:
        # Phase 1: execute the static plan.
        for call in plan:
            row, body = _execute(client, base_url, token, call)
            rows.append(row)

            # Capture cursor candidates for follow-up. Only source=both
            # matrix rows -- source=places cursor pages already work.
            # source=both was the regression we want to pin.
            if (
                call.scenario == SCENARIO_MATRIX
                and call.source == "both"
                and row.next_cursor_exists
                and isinstance(body, dict)
                and isinstance(body.get("next_cursor"), str)
                and call.sport not in sports_with_followup
                and cursor_followups_done + len(cursor_candidates) < max_cursors
            ):
                first_page_ids = frozenset(
                    str(it.get("id"))
                    for it in (body.get("items") or [])
                    if isinstance(it, dict) and isinstance(it.get("id"), str)
                )
                cursor_candidates.append(
                    (
                        PlannedCall(
                            scenario=SCENARIO_CURSOR_FOLLOWUP,
                            sport=call.sport,
                            location=call.location,
                            lat=call.lat,
                            lng=call.lng,
                            radius_km=call.radius_km,
                            source="both",
                            cursor=str(body["next_cursor"]),
                            first_page_ids=first_page_ids,
                        ),
                        first_page_ids,
                    )
                )
                sports_with_followup.add(call.sport)

        # Phase 2: cursor follow-ups (up to max_cursors).
        for followup_call, _first_page_ids in cursor_candidates[:max_cursors]:
            row, _body = _execute(client, base_url, token, followup_call)
            rows.append(row)
            cursor_followups_done += 1

    return rows


# ---------------------------------------------------------------------------
# Failure detection
# ---------------------------------------------------------------------------


def _is_unexpected_failure(row: Row) -> str | None:
    """Return a failure message if this row should fail the run, else None.

    Distinguishes positive scenarios (any 4xx/5xx/transport is failure)
    from the two expected-negative scenarios (which have their own
    documented success shapes).
    """

    # Transport failure -- always fatal regardless of scenario.
    if row.http_status is None:
        return f"transport/no-response: {row.error or '?'}"

    if row.scenario == SCENARIO_PLACES_NO_COORDS:
        # Documented contract: 200 + missing_coordinates + empty items.
        if row.http_status != 200:
            return f"places_no_coords http {row.http_status}"
        if row.provider_status != "missing_coordinates":
            return f"places_no_coords provider_status={row.provider_status!r}"
        if row.items_count != 0:
            return f"places_no_coords items_count={row.items_count}"
        if (row.google_places_count or 0) != 0:
            return f"places_no_coords google_places_count={row.google_places_count}"
        if row.next_cursor_exists:
            return "places_no_coords leaked next_cursor"
        return None

    if row.scenario == SCENARIO_INVALID_CURSOR:
        # Documented contract: NOT 5xx, NOT a parse crash. Backend
        # surfaces invalid cursor as 200 + provider_status="error" +
        # items=[] + next_cursor=null. Pin that exact shape; surface a
        # mismatch so a future contract change can't drift silently.
        if row.http_status >= 500:
            return f"invalid_cursor 5xx: status={row.http_status}"
        if row.http_status != 200:
            return f"invalid_cursor unexpected http {row.http_status}"
        if row.provider_status != "error":
            return f"invalid_cursor provider_status={row.provider_status!r} (expected 'error')"
        if (row.items_count or 0) != 0:
            return f"invalid_cursor items_count={row.items_count}"
        if row.next_cursor_exists:
            return "invalid_cursor leaked next_cursor"
        return None

    if row.scenario == SCENARIO_CURSOR_FOLLOWUP:
        if row.http_status >= 400:
            return f"cursor_followup http {row.http_status}"
        if row.error:
            return f"cursor_followup error: {row.error}"
        if (row.seed_count or 0) > 0:
            return (
                f"cursor_followup leaked {row.seed_count} seed row(s) -- source=both cursor pages must be Places-only"
            )
        return None

    # Default (baseline_seed, matrix): any 4xx+ or row.error is fatal.
    if row.http_status >= 400:
        return f"{row.scenario} http {row.http_status}: {row.error or ''}"
    if row.error:
        return f"{row.scenario} error: {row.error}"
    return None


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


def _summarise(rows: list[Row]) -> int:
    failures: list[str] = []

    # Per-row contract / health failures.
    for r in rows:
        msg = _is_unexpected_failure(r)
        if msg is not None:
            failures.append(
                f"[{r.scenario}] sport={r.sport} location={r.location} source={r.source} radius={r.radius_km}: {msg}"
            )

    # Aggregate failure: places + coords returning bad provider_status.
    bad_provider_statuses = {"disabled", "error", "quota_exceeded"}
    bad_places = [
        r
        for r in rows
        if r.scenario == SCENARIO_MATRIX
        and r.source == "places"
        and r.lat is not None
        and r.provider_status in bad_provider_statuses
    ]
    if bad_places:
        statuses = sorted({str(r.provider_status) for r in bad_places})
        failures.append(
            f"source=places with coords returned bad provider_status: {statuses} ({len(bad_places)} request(s))"
        )

    # Aggregate failure: most major sports return zero google_places
    # rows in Sydney under source=places. Signals broken key, missing
    # billing, or strategy-table regression.
    place_runs = [r for r in rows if r.scenario == SCENARIO_MATRIX and r.source == "places" and r.lat is not None]
    zero_runs = [r for r in place_runs if (r.google_places_count or 0) == 0]
    if place_runs and len(zero_runs) > len(place_runs) // 2:
        failures.append(
            f"{len(zero_runs)} / {len(place_runs)} source=places "
            "(sport x Sydney location x radius) combinations returned "
            "zero google_places rows -- Places coverage appears broken"
        )

    # --- Summary table ---------------------------------------------------
    print()
    print(
        f"{'scenario':<18}{'sport':<11}{'loc':<11}{'r':<4}{'source':<8}"
        f"{'http':<5}{'prov':<22}{'tot':<5}{'gp':<4}{'sd':<4}{'cur':<4} ms"
    )
    print("-" * 100)
    for r in rows:
        print(
            f"{r.scenario[:17]:<18}"
            f"{r.sport[:10]:<11}"
            f"{(r.location or '-')[:10]:<11}"
            f"{str(r.radius_km or '-'):<4}"
            f"{r.source[:7]:<8}"
            f"{str(r.http_status or '-'):<5}"
            f"{(r.provider_status or '-')[:21]:<22}"
            f"{str(r.total) if r.total is not None else '-':<5}"
            f"{str(r.google_places_count) if r.google_places_count is not None else '-':<4}"
            f"{str(r.seed_count) if r.seed_count is not None else '-':<4}"
            f"{'Y' if r.next_cursor_exists else '-':<4}"
            f" {r.elapsed_ms or 0}"
        )

    print()
    print(f"=== {len(rows)} requests, {len(failures)} failure condition(s) ===")
    for f in failures:
        print(f"  FAIL: {f}")
    if not failures:
        print("  OK: smoke clean")

    return 1 if failures else 0


# ---------------------------------------------------------------------------
# Output writer
# ---------------------------------------------------------------------------


def _write_output(rows: list[Row], path: str) -> None:
    serialisable = [asdict(r) for r in rows]
    if path.endswith(".json"):
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(serialisable, fh, indent=2, ensure_ascii=False)
        return
    if path.endswith(".csv"):
        if not serialisable:
            return
        keys = list(serialisable[0].keys())
        with open(path, "w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=keys)
            writer.writeheader()
            for row in serialisable:
                flat: dict[str, Any] = {}
                for k, v in row.items():
                    if isinstance(v, list):
                        flat[k] = " | ".join(
                            (",".join(str(x) for x in item) if isinstance(item, list) else str(item)) for item in v
                        )
                    else:
                        flat[k] = v
                writer.writerow(flat)
        return
    raise SystemExit(f"--output extension must be .csv or .json, got {path!r}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_csv_list(value: str | None) -> list[str]:
    if value is None:
        return []
    return [s.strip() for s in value.split(",") if s.strip()]


def _validate_subset(name: str, requested: Iterable[str], allowed: Iterable[str]) -> list[str]:
    allowed_set = list(allowed)
    bad = [s for s in requested if s not in allowed_set]
    if bad:
        raise SystemExit(f"smoke_venues_live: unknown {name}: {bad}. Allowed: {sorted(allowed_set)}")
    return list(requested)


def _argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="smoke_venues_live",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--base-url",
        required=True,
        help="API base URL, e.g. https://protin-api.fly.dev (no trailing slash).",
    )
    p.add_argument(
        "--token",
        default=os.environ.get("SPORTSGANG_SMOKE_TOKEN", ""),
        help=(
            "Bearer token (override). Prefer the SPORTSGANG_SMOKE_TOKEN env var "
            "-- CLI args show up in shell history and process listings. "
            "Never printed by this script."
        ),
    )
    p.add_argument(
        "--output",
        default=None,
        help="Optional path to write per-request results (.csv or .json).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help=("Print the planned requests and exit without making any HTTP calls. Does not require --token."),
    )
    p.add_argument(
        "--sports",
        default=",".join(SPORTS),
        help=(f"Comma-separated subset of sports to test. Allowed: {','.join(SPORTS)}. Default: all."),
    )
    p.add_argument(
        "--locations",
        default=",".join(LOCATIONS.keys()),
        help=(f"Comma-separated subset of locations to test. Allowed: {','.join(LOCATIONS.keys())}. Default: all."),
    )
    p.add_argument(
        "--radii",
        default=",".join(str(r) for r in RADII),
        help=f"Comma-separated radii in km. Default: {','.join(str(r) for r in RADII)}.",
    )
    p.add_argument(
        "--sources",
        default=",".join(COORD_SOURCES),
        help=(f"Comma-separated subset of coord-mode sources. Allowed: {','.join(COORD_SOURCES)}. Default: all."),
    )
    p.add_argument(
        "--max-cursors",
        type=int,
        default=_DEFAULT_MAX_CURSORS,
        help=(
            "Cap on source=both cursor follow-up requests across the run. "
            f"Default: {_DEFAULT_MAX_CURSORS} (~one per sport)."
        ),
    )
    p.add_argument(
        "--max-calls",
        type=int,
        default=_DEFAULT_MAX_CALLS,
        help=(
            "Hard cap on total HTTP calls (planned, before retries). "
            f"Run aborts before any call if exceeded. Default: {_DEFAULT_MAX_CALLS}."
        ),
    )
    return p


def _print_plan(plan: list[PlannedCall], *, max_cursors: int) -> None:
    print(f"=== dry-run: {len(plan)} static call(s) + up to {max_cursors} cursor follow-up(s) ===")
    for i, c in enumerate(plan, start=1):
        location = c.location or "-"
        coords = f"({c.lat},{c.lng})" if c.lat is not None and c.lng is not None else "-"
        radius = c.radius_km if c.radius_km is not None else "-"
        cursor = "<set>" if c.cursor else "-"
        print(
            f"  {i:>3} GET /venues/nearby "
            f"scenario={c.scenario} sport={c.sport} "
            f"location={location} coords={coords} radius_km={radius} "
            f"source={c.source} cursor={cursor}"
        )


def main(argv: list[str] | None = None) -> int:
    args = _argparser().parse_args(argv)

    base_url = args.base_url.rstrip("/")
    sports = _validate_subset("sport", _parse_csv_list(args.sports), SPORTS)
    location_names = _validate_subset("location", _parse_csv_list(args.locations), LOCATIONS.keys())
    locations = {name: LOCATIONS[name] for name in location_names}
    try:
        radii = [int(x) for x in _parse_csv_list(args.radii)]
    except ValueError as exc:
        raise SystemExit(f"smoke_venues_live: --radii must be integers: {exc}")
    if not radii:
        raise SystemExit("smoke_venues_live: --radii cannot be empty")
    sources = _validate_subset("source", _parse_csv_list(args.sources), COORD_SOURCES)

    if not sports:
        raise SystemExit("smoke_venues_live: --sports cannot be empty")
    if not locations:
        raise SystemExit("smoke_venues_live: --locations cannot be empty")
    if not sources:
        raise SystemExit("smoke_venues_live: --sources cannot be empty")
    if args.max_cursors < 0:
        raise SystemExit("smoke_venues_live: --max-cursors must be >= 0")
    if args.max_calls <= 0:
        raise SystemExit("smoke_venues_live: --max-calls must be > 0")

    plan = _build_static_plan(sports=sports, locations=locations, radii=radii, sources=sources)
    planned_total = len(plan) + args.max_cursors
    if planned_total > args.max_calls:
        print(
            f"smoke_venues_live: planned {planned_total} call(s) exceeds "
            f"--max-calls={args.max_calls}; aborting before any HTTP. "
            "Lower the scope or raise --max-calls.",
            file=sys.stderr,
        )
        return 2

    if args.dry_run:
        _print_plan(plan, max_cursors=args.max_cursors)
        return 0

    if not args.token:
        print(
            "smoke_venues_live: --token (or SPORTSGANG_SMOKE_TOKEN env var) is required when --dry-run is not set.",
            file=sys.stderr,
        )
        return 2

    rows = _run(
        base_url=base_url,
        token=args.token,
        plan=plan,
        max_cursors=args.max_cursors,
    )
    exit_code = _summarise(rows)
    if args.output:
        _write_output(rows, args.output)
        print(f"wrote {args.output}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
