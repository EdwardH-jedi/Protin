"""Static checks for the local seed_bots script.

Does not hit the database — just validates the bot config shape, the
placeholder-PNG generator, and the local-only environment guard so we
catch a typo or schema drift the moment somebody edits the script.
"""

from __future__ import annotations

import re
import sys
import zlib
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts import seed_bots  # noqa: E402


_VALID_SPORTS = {"gym", "golf", "tennis", "running"}
_VALID_LEVELS = {"beginner", "intermediate", "advanced"}
_VALID_TIMES = {"morning", "afternoon", "evening", "flexible"}


def test_bots_count_is_five() -> None:
    assert len(seed_bots._BOTS) == 5


def test_bot_emails_are_unique_and_local_domain() -> None:
    emails = [b["email"] for b in seed_bots._BOTS]
    assert len(set(emails)) == len(emails), "duplicate email in _BOTS"
    for email in emails:
        assert email.endswith("@protin.local"), f"non-local email: {email}"


def test_bot_required_fields_present() -> None:
    for bot in seed_bots._BOTS:
        for field in ("email", "display_name", "birth_year", "suburb", "bio", "color", "photo_count", "sport_profiles"):
            assert field in bot, f"missing field {field} in bot {bot.get('email')}"
        assert isinstance(bot["display_name"], str) and bot["display_name"].strip()
        assert 1900 < bot["birth_year"] < 2100
        assert 2 <= bot["photo_count"] <= 4, f"photo_count out of [2,4] for {bot['email']}"
        assert len(bot["sport_profiles"]) >= 1, f"{bot['email']} has no sport profile"


def test_bot_sport_profiles_use_valid_enums() -> None:
    for bot in seed_bots._BOTS:
        for sp in bot["sport_profiles"]:
            assert sp["sport"] in _VALID_SPORTS, sp
            assert sp["level"] in _VALID_LEVELS, sp
            for t in sp.get("preferred_times", []):
                assert t in _VALID_TIMES, sp


def test_make_solid_png_returns_valid_png_bytes() -> None:
    png = seed_bots._make_solid_png(8, 8, (200, 100, 50))
    # PNG signature
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    # IHDR chunk follows immediately
    assert png[12:16] == b"IHDR"
    # IEND closes the file
    assert png.endswith(b"IEND" + zlib.crc32(b"IEND").to_bytes(4, "big"))


def test_shade_brightness_decreases_per_index() -> None:
    base = (255, 255, 255)
    shades = [seed_bots._shade(base, i) for i in range(4)]
    for prev, curr in zip(shades, shades[1:]):
        assert curr[0] <= prev[0], f"brightness should decrease across photos: {shades}"


def test_seed_refuses_non_local_env(monkeypatch) -> None:
    """The script must refuse to run if app_env != 'local'."""
    from app.core import config

    class FakeSettings:
        app_env = "staging"

    monkeypatch.setattr(config, "get_settings", lambda: FakeSettings())
    monkeypatch.setattr(seed_bots, "get_settings", lambda: FakeSettings())

    import asyncio

    rc = asyncio.run(seed_bots.seed())
    assert rc == 1, "seed() must return non-zero when not in local env"


def test_url_prefix_format() -> None:
    """Generated URLs must match the existing /media/profile_photos/<uuid>/ shape so
    the StaticFiles mount can serve them and the mobile URL normalisation
    helper can absolutise them."""
    pattern = re.compile(r"^/media/profile_photos/[0-9a-fA-F-]{36}/\d{2}_seed\.png$")
    # Use a fixed UUID and hit the helper directly to build URLs without
    # touching the filesystem at module-test time.
    import tempfile
    from uuid import uuid4

    user_id = uuid4()
    with tempfile.TemporaryDirectory() as tmp:
        urls = seed_bots._write_bot_photos(
            user_id=user_id,
            color=(10, 20, 30),
            count=3,
            media_root=tmp,
            media_url_prefix="/media",
        )
        assert len(urls) == 3
        for u in urls:
            assert pattern.match(u), f"unexpected URL shape: {u}"
