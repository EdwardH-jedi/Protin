"""App Review / demo data seed.

Purpose
-------
Apple App Review (Guideline 2.1(a)) rejected SportsGang with the message
"No content loaded during review." The production reviewer account had
no discovery candidates, no matches, no chat history and no sessions, so
the Discover screen rendered the "No players to show right now." empty
state. This script seeds the minimum dataset Apple's reviewer needs to
exercise every advertised flow:

  * a reviewer login account with a complete profile across all four
    sports (gym, golf, tennis, running),
  * five demo discovery candidates (Chris, Kim, Luke, Taylor Kim, Sarah),
  * three mutual-interest matches against the reviewer (Chris, Kim,
    Sarah),
  * chat history on two of those matches so message previews and
    bidirectional bubbles render,
  * three bookings: one pending incoming proposal, one outgoing pending,
    one confirmed upcoming session.

Safety properties
-----------------
* Reads reviewer credentials from REVIEWER_EMAIL / REVIEWER_PASSWORD
  env vars. Never hardcodes secrets, never logs the password.
* Idempotent: rerunning converges on the same shape. Upserts users,
  profiles, sport profiles, matches by stable unique keys. Skips
  re-inserting chat messages when any exist on a match so a real
  reviewer conversation is not wiped on re-run. Updates booking
  start/end times forward on each run (intentional — keeps the demo
  future-facing for the next App Review window).
* Does NOT delete user data, wipe tables, or reset the DB.
* Demo discovery users are created with hashed_password=NULL (same
  shape as Apple-only accounts and the local seed_bots) so nobody can
  log in as them with a password.
* DRY_RUN=1 prints what would happen without committing.

Invocation
----------
On Fly (production):

    fly ssh console -a protin-api
    cd /app
    REVIEWER_EMAIL=review@sportsgang.app \\
      REVIEWER_PASSWORD='<set-by-operator>' \\
      python -m scripts.seed_review_data

The script does not gate on app_env — unlike seed_bots/reset_chris_*,
this one is *meant* to run against production. The credential env
vars are the gate.
"""

from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.booking import Booking
from app.models.chat import Message
from app.models.match import Match
from app.models.profile import IdentityPreferences, SportProfile, UserProfile
from app.models.user import User

# ---------------------------------------------------------------------------
# Seed catalogue
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SportSeed:
    sport: str  # "gym" | "golf" | "tennis" | "running"
    level: str  # "beginner" | "intermediate" | "advanced"
    preferred_times: tuple[str, ...]
    gym_name: str | None = None
    golf_club: str | None = None


@dataclass(frozen=True)
class DemoUserSeed:
    email: str
    display_name: str
    birth_year: int
    suburb: str
    bio: str
    sport_profiles: tuple[SportSeed, ...]


REVIEWER_DISPLAY_NAME = "Reviewer"
REVIEWER_SUBURB = "Annandale"
REVIEWER_BIO = (
    "App Review demo account. Hi reviewer — feel free to explore Discover, "
    "Matches, Chat and Events. Use the Profile tab for legal links and "
    "account deletion."
)
REVIEWER_BIRTH_YEAR = 1995
REVIEWER_SPORTS: tuple[SportSeed, ...] = (
    SportSeed(
        sport="gym",
        level="intermediate",
        preferred_times=("morning", "evening"),
        gym_name="Anytime Fitness Pyrmont",
    ),
    SportSeed(
        sport="golf",
        level="beginner",
        preferred_times=("afternoon", "flexible"),
        golf_club="Moore Park Golf",
    ),
    SportSeed(
        sport="tennis",
        level="intermediate",
        preferred_times=("evening", "flexible"),
    ),
    SportSeed(
        sport="running",
        level="intermediate",
        preferred_times=("morning",),
    ),
)


_DEMO_USERS: tuple[DemoUserSeed, ...] = (
    DemoUserSeed(
        email="chris.demo@sportsgang.app",
        display_name="Chris",
        birth_year=1993,
        suburb="Pyrmont",
        bio="Gym 4x/week, looking for a steady training partner. Weekends free.",
        sport_profiles=(
            SportSeed(
                sport="gym",
                level="intermediate",
                preferred_times=("morning", "evening"),
                gym_name="Anytime Fitness Pyrmont",
            ),
            SportSeed(
                sport="tennis",
                level="beginner",
                preferred_times=("evening",),
            ),
        ),
    ),
    DemoUserSeed(
        email="kim.demo@sportsgang.app",
        display_name="Kim",
        birth_year=1996,
        suburb="Glebe",
        bio="Casual tennis and gym. Easy hits on weekends, lifts after work.",
        sport_profiles=(
            SportSeed(
                sport="gym",
                level="beginner",
                preferred_times=("evening", "flexible"),
            ),
            SportSeed(
                sport="tennis",
                level="intermediate",
                preferred_times=("evening", "flexible"),
            ),
        ),
    ),
    DemoUserSeed(
        email="luke.demo@sportsgang.app",
        display_name="Luke",
        birth_year=1991,
        suburb="Newtown",
        bio="Running and gym. Half-marathon prep, easy strength work.",
        sport_profiles=(
            SportSeed(
                sport="gym",
                level="intermediate",
                preferred_times=("morning",),
            ),
            SportSeed(
                sport="running",
                level="advanced",
                preferred_times=("morning",),
            ),
        ),
    ),
    DemoUserSeed(
        email="taylor.kim.demo@sportsgang.app",
        display_name="Taylor Kim",
        birth_year=1997,
        suburb="Paddington",
        bio="Just started lifting. Looking for someone to keep me consistent.",
        sport_profiles=(
            SportSeed(
                sport="gym",
                level="beginner",
                preferred_times=("evening", "flexible"),
                gym_name="Plus Fitness Paddington",
            ),
            SportSeed(
                sport="running",
                level="beginner",
                preferred_times=("morning", "flexible"),
            ),
        ),
    ),
    DemoUserSeed(
        email="sarah.demo@sportsgang.app",
        display_name="Sarah",
        birth_year=1994,
        suburb="Surry Hills",
        bio="Gym + golf. Saturday round at Moore Park most weekends.",
        sport_profiles=(
            SportSeed(
                sport="gym",
                level="intermediate",
                preferred_times=("morning", "evening"),
                gym_name="Fitness First Surry Hills",
            ),
            SportSeed(
                sport="golf",
                level="intermediate",
                preferred_times=("afternoon", "flexible"),
                golf_club="Moore Park Golf",
            ),
        ),
    ),
)


# Demo users to mutually-match with the reviewer, by email.
_MUTUAL_MATCH_EMAILS: tuple[tuple[str, str], ...] = (
    # (demo email, sport)
    ("chris.demo@sportsgang.app", "gym"),
    ("kim.demo@sportsgang.app", "gym"),
    ("sarah.demo@sportsgang.app", "gym"),
)


# Chat seed: ordered messages keyed by demo email. The sender is
# either the demo user ("partner") or the reviewer ("reviewer"). The
# script only inserts these on a match that currently has zero
# messages — re-running never overwrites real reviewer-typed chat.
@dataclass(frozen=True)
class SeedMessage:
    sender: str  # "partner" | "reviewer"
    body: str


_CHAT_SEED: dict[str, tuple[SeedMessage, ...]] = {
    "chris.demo@sportsgang.app": (
        SeedMessage("partner", "Want to train this weekend?"),
        SeedMessage("reviewer", "Let’s find a court"),
        SeedMessage("partner", "Saturday morning works for me."),
    ),
    "kim.demo@sportsgang.app": (
        SeedMessage("partner", "Lets find a court"),
        SeedMessage("reviewer", "Sounds good!"),
    ),
}


# Bookings to seed. role indicates who the reviewer is in the booking:
#   "incoming"  — partner proposes to reviewer, status=proposed
#                 (renders as a pending incoming proposal for the
#                  reviewer to Accept/Decline).
#   "outgoing"  — reviewer proposes to partner, status=proposed
#                 (renders as an outgoing awaiting-confirmation card).
#   "confirmed" — confirmed upcoming session (renders in the Events
#                 tab "Upcoming sessions" group).
# `days_from_now` is intentionally re-evaluated on every run so the
# demo always shows a future-dated session for the next review cycle.
@dataclass(frozen=True)
class BookingSeed:
    partner_email: str
    role: str  # "incoming" | "outgoing" | "confirmed"
    days_from_now: int
    hour_utc: int
    notes: str


_BOOKING_SEEDS: tuple[BookingSeed, ...] = (
    BookingSeed(
        partner_email="chris.demo@sportsgang.app",
        role="incoming",
        days_from_now=3,
        hour_utc=22,  # 09:00 next-day Sydney (AEDT UTC+11) for review window
        notes="Saturday session — reviewer to Accept/Decline.",
    ),
    BookingSeed(
        partner_email="kim.demo@sportsgang.app",
        role="outgoing",
        days_from_now=4,
        hour_utc=21,
        notes="Outgoing proposal awaiting confirmation.",
    ),
    BookingSeed(
        partner_email="sarah.demo@sportsgang.app",
        role="confirmed",
        days_from_now=2,
        hour_utc=22,
        notes="Confirmed upcoming session.",
    ),
)


_BOOKING_VENUE = "Anytime Fitness Pyrmont, Pyrmont NSW 2009"
_BOOKING_SPORT = "gym"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _canonical_pair(a: UUID, b: UUID) -> tuple[UUID, UUID]:
    """Return the canonical (user1, user2) ordering used everywhere in the
    codebase: sort the two UUIDs by their string form (lexicographic).
    Matches ``services.discovery.record_action`` and the unique
    constraint on ``matches(user1_id, user2_id, sport)``.
    """
    s1, s2 = sorted([str(a), str(b)])
    return UUID(s1), UUID(s2)


async def _get_or_create_user(
    session: AsyncSession,
    *,
    email: str,
    hashed_password: str | None,
) -> tuple[User, bool]:
    """Return (user, created?). Always force is_active=True so a
    manually-deactivated demo account becomes visible again on re-run."""
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one_or_none()
    created = False
    if user is None:
        user = User(email=email, hashed_password=hashed_password, is_active=True)
        session.add(user)
        await session.flush()
        created = True
    else:
        user.is_active = True
        # Keep the reviewer's password fresh in case the env var rotated.
        # Demo users always stay password-NULL.
        if hashed_password is not None:
            user.hashed_password = hashed_password
    return user, created


async def _upsert_profile(
    session: AsyncSession,
    *,
    user_id: UUID,
    display_name: str,
    birth_year: int,
    suburb: str,
    bio: str,
) -> tuple[UserProfile, bool]:
    res = await session.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    profile = res.scalar_one_or_none()
    created = False
    if profile is None:
        profile = UserProfile(
            user_id=user_id,
            display_name=display_name,
            birth_year=birth_year,
            suburb=suburb,
            bio=bio,
        )
        session.add(profile)
        await session.flush()
        created = True
    else:
        profile.display_name = display_name
        profile.birth_year = birth_year
        profile.suburb = suburb
        profile.bio = bio
    return profile, created


async def _upsert_sport_profiles(
    session: AsyncSession,
    *,
    user_id: UUID,
    sport_seeds: tuple[SportSeed, ...],
) -> None:
    for sp_seed in sport_seeds:
        res = await session.execute(
            select(SportProfile).where(
                and_(
                    SportProfile.user_id == user_id,
                    SportProfile.sport == sp_seed.sport,
                )
            )
        )
        sp = res.scalar_one_or_none()
        if sp is None:
            session.add(
                SportProfile(
                    user_id=user_id,
                    sport=sp_seed.sport,
                    level=sp_seed.level,
                    preferred_times=list(sp_seed.preferred_times),
                    gym_name=sp_seed.gym_name,
                    golf_club=sp_seed.golf_club,
                )
            )
        else:
            sp.level = sp_seed.level
            sp.preferred_times = list(sp_seed.preferred_times)
            sp.gym_name = sp_seed.gym_name
            sp.golf_club = sp_seed.golf_club


async def _ensure_identity_preferences(session: AsyncSession, *, user_id: UUID) -> None:
    res = await session.execute(select(IdentityPreferences).where(IdentityPreferences.user_id == user_id))
    prefs = res.scalar_one_or_none()
    if prefs is None:
        session.add(IdentityPreferences(user_id=user_id))


async def _upsert_match(session: AsyncSession, *, user_a: UUID, user_b: UUID, sport: str) -> tuple[Match, bool]:
    u1, u2 = _canonical_pair(user_a, user_b)
    res = await session.execute(
        select(Match).where(
            and_(
                Match.user1_id == u1,
                Match.user2_id == u2,
                Match.sport == sport,
            )
        )
    )
    m = res.scalar_one_or_none()
    if m is None:
        m = Match(user1_id=u1, user2_id=u2, sport=sport, status="active")
        session.add(m)
        await session.flush()
        return m, True
    # Surface re-activation: a manually-archived match comes back live.
    m.status = "active"
    return m, False


async def _seed_chat_if_empty(
    session: AsyncSession,
    *,
    match_id: UUID,
    reviewer_id: UUID,
    partner_id: UUID,
    seed: tuple[SeedMessage, ...],
) -> int:
    """Insert seed messages only if the match has zero messages.

    Why: re-running the seed must not erase a real reviewer-typed
    conversation, and must not duplicate the canonical lines. Skip-on-
    non-empty is the simplest invariant that satisfies both.
    Returns the number of messages inserted (0 on skip).
    """
    existing = await session.execute(select(Message.id).where(Message.match_id == match_id).limit(1))
    if existing.first() is not None:
        return 0

    # Manually stagger created_at so list order is stable on every backend.
    # SQLAlchemy server_default=func.now() resolves at insert time and on
    # high-volume inserts can collapse to the same microsecond, which makes
    # message ordering unstable across re-runs.
    #
    # ``Message.created_at`` is declared as ``Mapped[datetime]`` without
    # ``DateTime(timezone=True)``, so Postgres stores it as TIMESTAMP
    # WITHOUT TIME ZONE. asyncpg refuses a tz-aware datetime there. Compute
    # in UTC and strip tzinfo so the values still represent UTC instants
    # but match the declared column type.
    base_utc = datetime.now(timezone.utc) - timedelta(minutes=len(seed) * 5)
    base = base_utc.replace(tzinfo=None)
    inserted = 0
    for i, msg in enumerate(seed):
        sender_id = reviewer_id if msg.sender == "reviewer" else partner_id
        session.add(
            Message(
                match_id=match_id,
                sender_id=sender_id,
                body=msg.body,
                created_at=base + timedelta(minutes=i * 5),
            )
        )
        inserted += 1
    return inserted


async def _upsert_booking(
    session: AsyncSession,
    *,
    reviewer_id: UUID,
    partner_id: UUID,
    match_id: UUID,
    seed: BookingSeed,
) -> tuple[Booking, bool]:
    """Upsert one demo booking.

    Idempotency key: (match_id, proposer_id, partner_id, sport). Each
    demo match needs exactly one booking per direction. On re-run we
    refresh starts_at/ends_at so the demo stays future-facing — the
    next App Review cycle should still see an upcoming session, not a
    stale past one.
    """
    if seed.role == "incoming":
        proposer_id, target_id = partner_id, reviewer_id
        target_status = "proposed"
    elif seed.role == "outgoing":
        proposer_id, target_id = reviewer_id, partner_id
        target_status = "proposed"
    elif seed.role == "confirmed":
        proposer_id, target_id = partner_id, reviewer_id
        target_status = "confirmed"
    else:
        raise ValueError(f"Unknown booking role: {seed.role!r}")

    now = datetime.now(timezone.utc)
    starts_at = (now + timedelta(days=seed.days_from_now)).replace(
        hour=seed.hour_utc, minute=0, second=0, microsecond=0
    )
    ends_at = starts_at + timedelta(hours=1)

    res = await session.execute(
        select(Booking).where(
            and_(
                Booking.match_id == match_id,
                Booking.proposer_id == proposer_id,
                Booking.partner_id == target_id,
                Booking.sport == _BOOKING_SPORT,
            )
        )
    )
    booking = res.scalar_one_or_none()
    if booking is None:
        booking = Booking(
            match_id=match_id,
            proposer_id=proposer_id,
            partner_id=target_id,
            sport=_BOOKING_SPORT,
            starts_at=starts_at,
            ends_at=ends_at,
            location=_BOOKING_VENUE,
            notes=seed.notes,
            status=target_status,
        )
        session.add(booking)
        await session.flush()
        return booking, True
    booking.starts_at = starts_at
    booking.ends_at = ends_at
    booking.location = _BOOKING_VENUE
    booking.notes = seed.notes
    # Only roll a terminal status forward if it has not already been moved
    # past the seed's target state by a real reviewer action.
    if booking.status in {"proposed", "confirmed"}:
        booking.status = target_status
    return booking, False


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


async def seed() -> int:
    reviewer_email = os.environ.get("REVIEWER_EMAIL", "").strip()
    reviewer_password = os.environ.get("REVIEWER_PASSWORD", "")
    dry_run = os.environ.get("DRY_RUN", "").strip() == "1"

    if not reviewer_email or not reviewer_password:
        print(
            "[seed_review] REVIEWER_EMAIL and REVIEWER_PASSWORD must be set in the environment. Refusing to run.",
            file=sys.stderr,
        )
        return 2

    settings = get_settings()
    engine = create_async_engine(settings.async_postgres_url)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    counts = {
        "users_created": 0,
        "users_updated": 0,
        "matches_created": 0,
        "matches_existing": 0,
        "messages_inserted": 0,
        "bookings_created": 0,
        "bookings_updated": 0,
    }

    try:
        async with Session() as session:
            # 1) Reviewer.
            hashed = hash_password(reviewer_password)
            reviewer_user, created = await _get_or_create_user(session, email=reviewer_email, hashed_password=hashed)
            counts["users_created" if created else "users_updated"] += 1
            await _upsert_profile(
                session,
                user_id=reviewer_user.id,
                display_name=REVIEWER_DISPLAY_NAME,
                birth_year=REVIEWER_BIRTH_YEAR,
                suburb=REVIEWER_SUBURB,
                bio=REVIEWER_BIO,
            )
            await _upsert_sport_profiles(session, user_id=reviewer_user.id, sport_seeds=REVIEWER_SPORTS)
            await _ensure_identity_preferences(session, user_id=reviewer_user.id)
            print(f"[seed_review] reviewer {'created' if created else 'updated'} email={reviewer_email}")

            # 2) Demo users.
            demo_by_email: dict[str, User] = {}
            for demo in _DEMO_USERS:
                u, was_created = await _get_or_create_user(session, email=demo.email, hashed_password=None)
                counts["users_created" if was_created else "users_updated"] += 1
                await _upsert_profile(
                    session,
                    user_id=u.id,
                    display_name=demo.display_name,
                    birth_year=demo.birth_year,
                    suburb=demo.suburb,
                    bio=demo.bio,
                )
                await _upsert_sport_profiles(session, user_id=u.id, sport_seeds=demo.sport_profiles)
                await _ensure_identity_preferences(session, user_id=u.id)
                demo_by_email[demo.email] = u
                print(
                    f"[seed_review] demo  {'created' if was_created else 'updated'}"
                    f" email={demo.email} display_name={demo.display_name}"
                )

            # 3) Matches.
            match_by_email: dict[str, Match] = {}
            for demo_email, sport in _MUTUAL_MATCH_EMAILS:
                partner = demo_by_email[demo_email]
                m, was_created = await _upsert_match(
                    session,
                    user_a=reviewer_user.id,
                    user_b=partner.id,
                    sport=sport,
                )
                counts["matches_created" if was_created else "matches_existing"] += 1
                match_by_email[demo_email] = m
                print(
                    f"[seed_review] match {'created' if was_created else 'existing'} sport={sport} partner={demo_email}"
                )

            # 4) Chat seed (only when match has no messages yet).
            for demo_email, msgs in _CHAT_SEED.items():
                m = match_by_email.get(demo_email)
                if m is None:
                    continue
                inserted = await _seed_chat_if_empty(
                    session,
                    match_id=m.id,
                    reviewer_id=reviewer_user.id,
                    partner_id=demo_by_email[demo_email].id,
                    seed=msgs,
                )
                counts["messages_inserted"] += inserted
                action = "seeded" if inserted else "skipped (already had messages)"
                print(f"[seed_review] chat  {action} match={m.id} partner={demo_email} inserted={inserted}")

            # 5) Bookings.
            for bk_seed in _BOOKING_SEEDS:
                m = match_by_email.get(bk_seed.partner_email)
                if m is None:
                    print(
                        f"[seed_review] WARN no match for booking partner {bk_seed.partner_email} — skipping booking",
                        file=sys.stderr,
                    )
                    continue
                partner = demo_by_email[bk_seed.partner_email]
                booking, was_created = await _upsert_booking(
                    session,
                    reviewer_id=reviewer_user.id,
                    partner_id=partner.id,
                    match_id=m.id,
                    seed=bk_seed,
                )
                counts["bookings_created" if was_created else "bookings_updated"] += 1
                print(
                    f"[seed_review] booking {'created' if was_created else 'updated'}"
                    f" role={bk_seed.role} status={booking.status}"
                    f" partner={bk_seed.partner_email} starts_at={booking.starts_at}"
                )

            if dry_run:
                print("[seed_review] DRY_RUN=1 — rolling back, no changes persisted.")
                await session.rollback()
            else:
                await session.commit()
    finally:
        await engine.dispose()

    # Reviewer can see Discover candidates because we do NOT insert any
    # DiscoveryAction rows for the reviewer — every demo user is still
    # unacted-on from the reviewer's perspective, so the discovery feed
    # returns all five. Matches and bookings are created directly via the
    # model layer, bypassing services.discovery / services.bookings, so no
    # push notifications fire and no "starts_at < now" validation gates
    # the seed.
    print("[seed_review] summary:")
    for k, v in counts.items():
        print(f"  {k}: {v}")
    print("[seed_review] done.")
    return 0


def main() -> None:
    sys.exit(asyncio.run(seed()))


if __name__ == "__main__":
    main()
