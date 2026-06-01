"""Regression guard for venue seed packaging.

Production v1.1 shipped with an empty venue catalog because the API
Docker image copied ``apps/api/scripts/`` but not ``apps/api/data/``.
``scripts/seed_venues.py`` resolves the data file as
``scripts/../data/venues_sydney.json``; with the data directory absent
from the image, the seed script exited with "No data file at ..." and
the prod DB never gained any rows. ``/venues/nearby`` then returned
``items=[]`` for every sport / source mode, with no in-app affordance
to recover (Google Places was also unavailable).

These tests pin the package layout from the repo side. They run with
no DB, no network, no fixtures — any failure indicates either:
  * the data file moved without ``seed_venues.py`` being updated, or
  * a future Dockerfile change drops the data directory again.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import seed_venues


@pytest.fixture
def seed_payload() -> list[dict]:
    """Parsed venue seed rows from the file the seed script reads."""
    return json.loads(seed_venues.DATA_PATH.read_text(encoding="utf-8"))


def test_seed_data_path_is_resolvable_from_scripts_layout() -> None:
    """``DATA_PATH`` must point at a real file under the repo source.

    The runtime image mirrors this layout: ``scripts/`` and ``data/``
    are siblings under ``/app``. The repo source tree under
    ``apps/api/`` matches the image because the Dockerfile copies both
    ``apps/api/scripts`` and ``apps/api/data`` to the WORKDIR.
    """
    assert seed_venues.DATA_PATH.exists(), (
        f"Venue seed data missing at {seed_venues.DATA_PATH!s}. "
        "The Dockerfile must copy apps/api/data alongside apps/api/scripts "
        "so the runtime image contains /app/data/venues_sydney.json."
    )


def test_seed_data_path_is_under_scripts_parent() -> None:
    """Pin the relative layout so future moves cannot silently drift.

    ``scripts/seed_venues.py`` computes
    ``Path(__file__).resolve().parent.parent / "data" / "venues_sydney.json"``.
    If anyone refactors that to a different sibling shape, the Docker
    COPY for ``./data`` becomes wrong and prod ships empty again.
    """
    scripts_dir = Path(seed_venues.__file__).resolve().parent
    expected = scripts_dir.parent / "data" / "venues_sydney.json"
    assert seed_venues.DATA_PATH == expected, (
        "seed_venues.DATA_PATH no longer resolves as scripts/../data/...; "
        "update the Dockerfile data COPY to match the new layout."
    )


def test_seed_data_file_is_non_empty_json_list(seed_payload: list[dict]) -> None:
    """The JSON the seed reads must at least be parseable as a list.

    Catches accidental empty-file or garbled-content commits before
    they ride a prod deploy and result in a zero-row venue catalog.
    """
    assert isinstance(seed_payload, list)
    assert len(seed_payload) > 0, "venues_sydney.json must contain at least one row"


def test_seed_rows_carry_usable_coordinates(seed_payload: list[dict]) -> None:
    """Every row must expose float-coercible lat/lng in Sydney's range.

    ``/venues/nearby`` filters by haversine distance from the caller's
    coordinates, so a row with a missing or non-numeric lat/lng would
    silently drop out of every result set even after a successful seed.
    Pinning a coarse Sydney bounding box also catches the obvious
    string-typo class of regression (e.g. swapped lat/lng).
    """
    for entry in seed_payload:
        lat = float(entry["latitude"])
        lng = float(entry["longitude"])
        assert -35.0 <= lat <= -33.0, f"latitude {lat} for {entry.get('name')!r} outside Sydney"
        assert 150.0 <= lng <= 152.0, f"longitude {lng} for {entry.get('name')!r} outside Sydney"


def test_seed_rows_cover_supported_sports(seed_payload: list[dict]) -> None:
    """Rows must carry ``sport_tags`` matching the app's supported sports.

    ``scripts/seed_venues.py`` reads ``entry["sport_tags"]`` unconditionally
    (no ``.get`` default), and ``/venues/nearby`` filters by sport. If the
    field disappears or only contains unknown sports, the seed either
    crashes or produces a catalog that no sport tab can surface.
    """
    supported = {"gym", "golf", "tennis", "running"}
    all_tags: set[str] = set()
    for entry in seed_payload:
        tags = entry["sport_tags"]
        assert isinstance(tags, list) and tags, (
            f"{entry.get('name')!r} is missing sport_tags"
        )
        all_tags.update(tags)
    covered = all_tags & supported
    assert covered, (
        f"venues_sydney.json sport_tags {sorted(all_tags)} do not intersect "
        f"the supported sports {sorted(supported)}; /venues/nearby will "
        "return items=[] for every tab."
    )
