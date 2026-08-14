"""Tests for the local seed_bots script.

Two layers:
  - static config / helper checks that catch a typo or schema drift
  - DB-backed idempotency tests that prove running the upsert twice
    converges on exactly one user / profile / photo set / sport set per
    bot, and that removing a sport from the config drops it on the next
    run. Uses an in-memory aiosqlite engine so no real Postgres is
    required.
"""

from __future__ import annotations

import re
import sys
import tempfile
import zlib
from pathlib import Path
from typing import AsyncGenerator
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.base import Base  # noqa: E402
from app.models.profile import ProfilePhoto, SportProfile, UserProfile  # noqa: E402
from app.models.user import User  # noqa: E402
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


# ---------------------------------------------------------------------------
# DB-backed idempotency tests
# ---------------------------------------------------------------------------

_TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db_session(tmp_path) -> AsyncGenerator[tuple[AsyncSession, Path], None]:
    """Yields (session, media_root) bound to a fresh in-memory schema."""
    engine = create_async_engine(_TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    media_root = tmp_path / "media"
    media_root.mkdir()
    async with Session() as session:
        yield session, media_root
    await engine.dispose()


async def _count(session: AsyncSession, model, **filters) -> int:
    stmt = select(func.count()).select_from(model)
    for col, val in filters.items():
        stmt = stmt.where(getattr(model, col) == val)
    return (await session.execute(stmt)).scalar_one()


async def test_upsert_bot_is_idempotent_across_two_runs(db_session) -> None:
    """Running the upsert twice for the same bot must converge on:
    1 user, 1 profile, exactly photo_count photos, exactly the configured
    sport count. No row inflation."""
    session, media_root = db_session
    bot = seed_bots._BOTS[1]  # Sam Chen — has 4 photos and 2 sport profiles

    user_id_first = await seed_bots._upsert_bot(session, bot, str(media_root), "/media")
    await session.commit()
    user_id_second = await seed_bots._upsert_bot(session, bot, str(media_root), "/media")
    await session.commit()

    assert user_id_first == user_id_second, "upsert must reuse the existing user row"

    assert await _count(session, User, email=bot["email"]) == 1
    assert await _count(session, UserProfile, user_id=user_id_first) == 1

    profile = (await session.execute(select(UserProfile).where(UserProfile.user_id == user_id_first))).scalar_one()

    assert await _count(session, ProfilePhoto, profile_id=profile.id) == bot["photo_count"], (
        "photo count must not inflate across re-runs"
    )
    assert await _count(session, SportProfile, user_id=user_id_first) == len(bot["sport_profiles"]), (
        "sport profile count must not inflate across re-runs"
    )


async def test_upsert_bot_seeds_all_five_bots_idempotently(db_session) -> None:
    """Run the full _BOTS list through _upsert_bot twice; the DB should
    end up with exactly 5 users, 5 profiles, sum(photo_counts) photos,
    and sum(sport_profile counts) sport rows."""
    session, media_root = db_session

    for _ in range(2):
        for bot in seed_bots._BOTS:
            await seed_bots._upsert_bot(session, bot, str(media_root), "/media")
        await session.commit()

    expected_photos = sum(b["photo_count"] for b in seed_bots._BOTS)
    expected_sports = sum(len(b["sport_profiles"]) for b in seed_bots._BOTS)

    assert await _count(session, User) == len(seed_bots._BOTS)
    assert await _count(session, UserProfile) == len(seed_bots._BOTS)
    assert await _count(session, ProfilePhoto) == expected_photos
    assert await _count(session, SportProfile) == expected_sports


async def test_upsert_bot_drops_sports_removed_from_config(db_session) -> None:
    """If the seed config removes a sport from a bot, the next upsert
    must delete the orphaned SportProfile row rather than leave it behind."""
    session, media_root = db_session
    bot = dict(seed_bots._BOTS[1])  # Sam Chen — tennis + running
    bot["sport_profiles"] = list(bot["sport_profiles"])

    user_id = await seed_bots._upsert_bot(session, bot, str(media_root), "/media")
    await session.commit()
    assert await _count(session, SportProfile, user_id=user_id) == 2

    # Drop "running" from the configured set.
    bot["sport_profiles"] = [sp for sp in bot["sport_profiles"] if sp["sport"] != "running"]
    await seed_bots._upsert_bot(session, bot, str(media_root), "/media")
    await session.commit()

    rows = (await session.execute(select(SportProfile.sport).where(SportProfile.user_id == user_id))).scalars().all()
    assert list(rows) == ["tennis"], f"expected only the configured sport to remain, got {rows}"


async def test_upsert_bot_reactivates_a_deactivated_user(db_session) -> None:
    """If a bot user is manually deactivated locally, re-seeding must
    flip is_active back to True so the bot reappears in Discovery."""
    session, media_root = db_session
    bot = seed_bots._BOTS[0]

    user_id = await seed_bots._upsert_bot(session, bot, str(media_root), "/media")
    await session.commit()

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
    user.is_active = False
    await session.commit()
    assert user.is_active is False

    await seed_bots._upsert_bot(session, bot, str(media_root), "/media")
    await session.commit()

    refreshed = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
    assert refreshed.is_active is True, "re-seeding must reactivate the bot user"
