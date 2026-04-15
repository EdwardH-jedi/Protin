"""Offline evaluation of the matching algorithm.

Loads fixtures from ``tests/fixtures/matching_eval.json`` and asserts that
``app.services.discovery._score_compatibility`` returns the expected score
for each case (within a small floating-point tolerance).

The function under test is pure — no DB, no network — so these tests run
as plain synchronous asserts and do not exercise the FastAPI client.
Each fixture is a frozen expectation: if the scoring formula changes,
update both the fixture and this test together.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.services.discovery import _score_compatibility

_FIXTURES_PATH = Path(__file__).parent / "fixtures" / "matching_eval.json"


def _load_cases() -> list[dict[str, Any]]:
    with _FIXTURES_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)["cases"]


_CASES = _load_cases()


@pytest.mark.parametrize(
    "case",
    _CASES,
    ids=[c["id"] for c in _CASES],
)
def test_score_matches_fixture(case: dict[str, Any]) -> None:
    # _score_compatibility expects a SportProfile-like object; a SimpleNamespace
    # with .level and .preferred_times attributes is sufficient (duck-typing).
    target_sp = SimpleNamespace(
        level=case["target_level"],
        preferred_times=case["target_times"],
    )
    score = _score_compatibility(
        case["actor_level"],
        case["actor_times"],
        target_sp,
    )
    assert score == pytest.approx(case["expected_score"], abs=1e-6), (
        f"case {case['id']}: expected {case['expected_score']}, got {score}"
    )


def test_fixture_contains_expected_coverage() -> None:
    """Guardrail against the fixture file being truncated or emptied."""
    ids = {c["id"] for c in _CASES}
    required = {
        "exact_level_exact_time",
        "two_levels_apart_no_time_overlap",
        "actor_flexible_counts_as_full_overlap",
        "target_flexible_counts_as_full_overlap",
        "empty_actor_times_no_overlap",
        "empty_target_times_no_overlap",
        "unknown_actor_level_defaults_to_intermediate",
    }
    missing = required - ids
    assert not missing, f"matching eval fixture missing required cases: {missing}"


def test_score_bounds() -> None:
    """All fixture-produced scores must lie in [0, 1]."""
    for case in _CASES:
        target_sp = SimpleNamespace(
            level=case["target_level"],
            preferred_times=case["target_times"],
        )
        score = _score_compatibility(
            case["actor_level"],
            case["actor_times"],
            target_sp,
        )
        assert 0.0 <= score <= 1.0, f"case {case['id']} produced out-of-bounds score {score}"
