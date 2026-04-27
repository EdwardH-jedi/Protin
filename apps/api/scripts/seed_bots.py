"""Local-only seed script: 5 demo bot profiles for Discovery testing.

Run from ``apps/api/``::

    python -m scripts.seed_bots

The script refuses to run unless ``settings.app_env == "local"`` so it
cannot accidentally populate a staging or production database with bots.

Each run upserts the same 5 bots by email — re-running is safe and will
not create duplicates. Existing photo rows / files for each bot are
replaced so re-seeding always converges on the same shape.

Bots are created with ``hashed_password = NULL`` (the same shape used for
Apple-only accounts) so they exist as discoverable users but cannot log
in via the password endpoint. They appear in ``GET /discovery`` because
the only filters are ``is_active``, prior actions, and blocks.
"""

from __future__ import annotations

import asyncio
import struct
import sys
import zlib
from pathlib import Path
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models.profile import ProfilePhoto, SportProfile, UserProfile
from app.models.user import User

# ---------------------------------------------------------------------------
# Bot definitions — stable across runs so upsert-by-email is deterministic.
# ---------------------------------------------------------------------------

BotSportProfile = dict[str, object]


class BotSeed(dict):
    """Typed-ish wrapper just so the static config reads cleanly below."""

    email: str
    display_name: str
    birth_year: int
    suburb: str
    bio: str
    color: tuple[int, int, int]
    photo_count: int
    sport_profiles: list[BotSportProfile]


_BOTS: list[BotSeed] = [
    {
        "email": "bot.alex@protin.local",
        "display_name": "Alex Park",
        "birth_year": 1992,
        "suburb": "Surry Hills",
        "bio": "Early-morning gym sessions, rest on Sundays. Looking for steady accountability partners.",
        "color": (220, 80, 80),
        "photo_count": 3,
        "sport_profiles": [
            {
                "sport": "gym",
                "level": "intermediate",
                "preferred_times": ["morning", "evening"],
                "gym_name": "Fitness First Surry Hills",
            },
        ],
    },
    {
        "email": "bot.sam@protin.local",
        "display_name": "Sam Chen",
        "birth_year": 1995,
        "suburb": "Bondi",
        "bio": "Tennis 3x a week and beach runs on the weekend. Open to friendly hits.",
        "color": (80, 160, 220),
        "photo_count": 4,
        "sport_profiles": [
            {
                "sport": "tennis",
                "level": "intermediate",
                "preferred_times": ["evening", "flexible"],
            },
            {
                "sport": "running",
                "level": "intermediate",
                "preferred_times": ["morning"],
            },
        ],
    },
    {
        "email": "bot.jordan@protin.local",
        "display_name": "Jordan Reyes",
        "birth_year": 1988,
        "suburb": "Newtown",
        "bio": "Marathon prep. Long runs Sunday mornings, easy 10ks during the week.",
        "color": (90, 200, 130),
        "photo_count": 2,
        "sport_profiles": [
            {
                "sport": "running",
                "level": "advanced",
                "preferred_times": ["morning"],
            },
        ],
    },
    {
        "email": "bot.priya@protin.local",
        "display_name": "Priya Singh",
        "birth_year": 1990,
        "suburb": "Manly",
        "bio": "Golf weekends, casual gym for strength. Northern Beaches local.",
        "color": (220, 180, 60),
        "photo_count": 3,
        "sport_profiles": [
            {
                "sport": "golf",
                "level": "beginner",
                "preferred_times": ["afternoon", "flexible"],
                "golf_club": "Long Reef Golf Club",
            },
            {
                "sport": "gym",
                "level": "beginner",
                "preferred_times": ["evening"],
            },
        ],
    },
    {
        "email": "bot.taylor@protin.local",
        "display_name": "Taylor Kim",
        "birth_year": 1997,
        "suburb": "Paddington",
        "bio": "Just started lifting. Looking for someone to keep me consistent at the gym.",
        "color": (170, 100, 200),
        "photo_count": 2,
        "sport_profiles": [
            {
                "sport": "gym",
                "level": "beginner",
                "preferred_times": ["evening", "flexible"],
                "gym_name": "Plus Fitness Paddington",
            },
        ],
    },
]


# ---------------------------------------------------------------------------
# Placeholder image generation (offline-safe)
# ---------------------------------------------------------------------------


def _make_solid_png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    """Return PNG bytes for a solid-color rectangle. Pure stdlib."""

    def _chunk(typ: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    # 8-bit RGB, no palette, no interlace
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)

    row = b"\x00" + bytes(rgb) * width  # filter byte 0 + pixel row
    raw = row * height
    idat = zlib.compress(raw, 6)

    return sig + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b"")


def _shade(rgb: tuple[int, int, int], i: int) -> tuple[int, int, int]:
    """Slight per-photo darkening so the 2-4 photos look distinguishable."""
    factor = max(70, 255 - i * 35)  # 255, 220, 185, 150 for i=0..3
    r, g, b = rgb
    return (r * factor) // 255, (g * factor) // 255, (b * factor) // 255


def _write_bot_photos(
    user_id: UUID,
    color: tuple[int, int, int],
    count: int,
    media_root: str,
    media_url_prefix: str,
) -> list[str]:
    """Generate ``count`` solid-color PNGs under the user's media dir.

    Wipes any existing files in the user's dir first so repeated seeding
    converges. Returns ordered public URLs (relative ``/media/...`` paths,
    matching the existing PUT /users/me/photos contract).
    """
    user_dir = Path(media_root) / "profile_photos" / str(user_id)
    if user_dir.exists():
        for existing in user_dir.iterdir():
            if existing.is_file():
                existing.unlink()
    user_dir.mkdir(parents=True, exist_ok=True)

    url_prefix = media_url_prefix.rstrip("/")
    urls: list[str] = []
    for i in range(count):
        png = _make_solid_png(256, 256, _shade(color, i))
        name = f"{i:02d}_seed.png"
        (user_dir / name).write_bytes(png)
        urls.append(f"{url_prefix}/profile_photos/{user_id}/{name}")
    return urls


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------


async def _upsert_bot(
    session: AsyncSession,
    bot: BotSeed,
    media_root: str,
    media_url_prefix: str,
) -> UUID:
    # 1. User (find by email; create with NULL password if missing).
    res = await session.execute(select(User).where(User.email == bot["email"]))
    user = res.scalar_one_or_none()
    if user is None:
        user = User(email=bot["email"], hashed_password=None, is_active=True)
        session.add(user)
        await session.flush()
    else:
        # Re-seeding must restore visibility — if the bot was manually
        # deactivated locally (e.g. to test deactivation flows), re-running
        # the seed brings it back into Discovery.
        user.is_active = True

    # 2. Profile (upsert by user_id).
    res = await session.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = res.scalar_one_or_none()
    if profile is None:
        profile = UserProfile(
            user_id=user.id,
            display_name=bot["display_name"],
            birth_year=bot["birth_year"],
            suburb=bot["suburb"],
            bio=bot["bio"],
        )
        session.add(profile)
        await session.flush()
    else:
        profile.display_name = bot["display_name"]
        profile.birth_year = bot["birth_year"]
        profile.suburb = bot["suburb"]
        profile.bio = bot["bio"]

    # 3. Photos (replace-all: delete rows + files, regenerate).
    await session.execute(
        delete(ProfilePhoto).where(ProfilePhoto.profile_id == profile.id)
    )
    urls = _write_bot_photos(
        user.id, bot["color"], bot["photo_count"], media_root, media_url_prefix
    )
    for idx, url in enumerate(urls):
        session.add(
            ProfilePhoto(profile_id=profile.id, photo_url=url, position=idx)
        )
    profile.avatar_url = urls[0] if urls else None

    # 4. Sport profiles.
    # Drop any sport_profile rows for this bot whose sport is no longer in
    # the configured set so editing the seed config to remove a sport doesn't
    # leave orphaned rows behind. Then upsert by (user_id, sport).
    configured_sports = {sp["sport"] for sp in bot["sport_profiles"]}
    await session.execute(
        delete(SportProfile).where(
            SportProfile.user_id == user.id,
            SportProfile.sport.notin_(configured_sports),
        )
    )
    for sp_data in bot["sport_profiles"]:
        res = await session.execute(
            select(SportProfile).where(
                SportProfile.user_id == user.id,
                SportProfile.sport == sp_data["sport"],
            )
        )
        sp = res.scalar_one_or_none()
        if sp is None:
            session.add(SportProfile(user_id=user.id, **sp_data))
        else:
            for key, value in sp_data.items():
                setattr(sp, key, value)

    return user.id


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


async def seed() -> int:
    settings = get_settings()
    if settings.app_env != "local":
        print(
            f"[seed_bots] Refusing to run in app_env={settings.app_env!r}. "
            "This script is local/dev only.",
            file=sys.stderr,
        )
        return 1

    engine = create_async_engine(settings.async_postgres_url)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    try:
        async with Session() as session:
            for bot in _BOTS:
                user_id = await _upsert_bot(
                    session, bot, settings.media_root, settings.media_url_prefix
                )
                print(f"[seed_bots] upserted {bot['email']:<28} -> user_id={user_id}")
            await session.commit()
    finally:
        await engine.dispose()

    print(f"[seed_bots] done -- {len(_BOTS)} bots seeded.")
    return 0


def main() -> None:
    sys.exit(asyncio.run(seed()))


if __name__ == "__main__":
    main()
