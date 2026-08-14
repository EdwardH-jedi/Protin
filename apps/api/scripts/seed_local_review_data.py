"""Local reviewer seed — idempotent, dev-only.

Resets the local reviewer account (``review@sportsgang.app``) to a known
state and creates a small set of demo partners that the reviewer is
mutually matched with, so Discover / Matches / Chat render with real
content during local QA.

Run from ``apps/api/``::

    python -m scripts.seed_local_review_data

Safety properties
-----------------
* **Local/dev only.** Refuses to run when ``APP_ENV`` is
  ``production`` or ``staging``. Defaults (empty / ``local`` / ``dev``
  / ``test``) are allowed.
* **Idempotent.** Upserts by stable unique keys; running twice
  converges to the same shape. Sport profiles upsert on
  ``(user_id, sport)``; matches insert via
  :func:`services.discovery.record_action` which is itself idempotent.
* **No production seed touched.** This file is independent of
  ``scripts.seed_review_data`` (the App Store reviewer seed), so
  changes here cannot drift production demo data.
* **Sport vocabulary.** Uses only the app's controlled
  ``gym | golf | tennis | running`` set (see
  ``app/schemas/venues.py:9``). The task brief mentioned
  basketball/badminton — those are intentionally omitted because the
  ``Sport`` literal at the API boundary rejects them.

The reviewer credentials are intentionally hardcoded for the local
flow only — there's no production reviewer to protect here, and the
operator should not have to plumb env vars to spin up a dev demo. The
production reviewer flow lives in :mod:`scripts.seed_review_data` and
DOES require env vars.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.challenge import SportsChallenge
from app.models.match import Match
from app.models.profile import IdentityPreferences, SportProfile, UserProfile
from app.models.user import User
from app.services.challenges import accept_challenge, create_challenge
from app.services.discovery import record_action

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


REVIEWER_EMAIL = "review@sportsgang.app"
REVIEWER_PASSWORD = "Review123!"  # noqa: S105 — local-only dev credential
REVIEWER_DISPLAY_NAME = "Review Player"
REVIEWER_SUBURB = "Annandale"
REVIEWER_BIRTH_YEAR = 1995
REVIEWER_BIO = (
    "Local QA reviewer account. Try Discover, Matches and Events. Profile tab has account deletion and legal links."
)


@dataclass(frozen=True)
class SportSeed:
    sport: str
    level: str
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
    # Sport in which this partner will be mutually matched with the
    # reviewer. Must appear in BOTH the reviewer's sport_profiles and
    # the partner's sport_profiles for the discovery match flow to be
    # realistic.
    match_sport: str


REVIEWER_SPORTS: tuple[SportSeed, ...] = (
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
    SportSeed(
        sport="gym",
        level="beginner",
        preferred_times=("evening",),
        gym_name="Anytime Fitness Surry Hills",
    ),
)


_DEMO_USERS: tuple[DemoUserSeed, ...] = (
    DemoUserSeed(
        email="alex.local@sportsgang.app",
        display_name="Alex",
        birth_year=1994,
        suburb="Newtown",
        bio="Tennis 2x/week, easy hits after work. Down for a hit at Camperdown.",
        sport_profiles=(
            SportSeed(
                sport="tennis",
                level="intermediate",
                preferred_times=("evening", "flexible"),
            ),
        ),
        match_sport="tennis",
    ),
    DemoUserSeed(
        email="jordan.local@sportsgang.app",
        display_name="Jordan",
        birth_year=1996,
        suburb="Glebe",
        bio="Mixed gym + tennis. Lifts mornings, hits weekends.",
        sport_profiles=(
            SportSeed(
                sport="tennis",
                level="beginner",
                preferred_times=("evening",),
            ),
            SportSeed(
                sport="gym",
                level="intermediate",
                preferred_times=("morning",),
                gym_name="Plus Fitness Glebe",
            ),
        ),
        match_sport="tennis",
    ),
    DemoUserSeed(
        email="sam.local@sportsgang.app",
        display_name="Sam",
        birth_year=1992,
        suburb="Camperdown",
        bio="Half-marathon prep — easy long runs, occasional intervals.",
        sport_profiles=(
            SportSeed(
                sport="running",
                level="advanced",
                preferred_times=("morning",),
            ),
        ),
        match_sport="running",
    ),
    DemoUserSeed(
        email="riley.local@sportsgang.app",
        display_name="Riley",
        birth_year=1997,
        suburb="Marrickville",
        bio="Strength + tennis. Looking for a casual training partner mid-week.",
        sport_profiles=(
            SportSeed(
                sport="gym",
                level="beginner",
                preferred_times=("evening", "flexible"),
                gym_name="PCYC Marrickville",
            ),
            SportSeed(
                sport="tennis",
                level="intermediate",
                preferred_times=("evening",),
            ),
        ),
        match_sport="gym",
    ),
)


# ---------------------------------------------------------------------------
# Env gate
# ---------------------------------------------------------------------------


_BLOCKED_ENVS = {"production", "staging"}


def _assert_local_env() -> None:
    settings = get_settings()
    if settings.app_env in _BLOCKED_ENVS:
        print(
            f"[seed_local_review_data] REFUSING to run in APP_ENV={settings.app_env!r}. "
            "This script is for local/dev only. Use scripts.seed_review_data for "
            "production reviewer seeding.",
            file=sys.stderr,
        )
        sys.exit(2)


# ---------------------------------------------------------------------------
# Upserts
# ---------------------------------------------------------------------------


async def _get_or_create_user(
    db: AsyncSession,
    *,
    email: str,
    hashed_password: str | None,
) -> tuple[User, bool]:
    """Return ``(user, created)``. ``hashed_password=None`` makes the
    demo partner non-loginable (Apple-only-account shape)."""
    res = await db.execute(select(User).where(User.email == email))
    user = res.scalar_one_or_none()
    if user is None:
        user = User(email=email, hashed_password=hashed_password, is_active=True)
        db.add(user)
        await db.flush()
        return user, True
    user.is_active = True
    if hashed_password is not None:
        user.hashed_password = hashed_password
    return user, False


async def _upsert_profile(
    db: AsyncSession,
    *,
    user_id: UUID,
    display_name: str,
    birth_year: int,
    suburb: str,
    bio: str,
) -> tuple[bool, str | None]:
    """Returns ``(was_created, previous_display_name_or_None)`` —
    the previous name is reported only when it changes, to surface
    cases like the ``Shsj`` corruption that motivated this script."""
    res = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    profile = res.scalar_one_or_none()
    if profile is None:
        db.add(
            UserProfile(
                user_id=user_id,
                display_name=display_name,
                birth_year=birth_year,
                suburb=suburb,
                bio=bio,
            )
        )
        return True, None
    previous = profile.display_name if profile.display_name != display_name else None
    profile.display_name = display_name
    profile.birth_year = birth_year
    profile.suburb = suburb
    profile.bio = bio
    return False, previous


async def _upsert_sport_profiles(
    db: AsyncSession,
    *,
    user_id: UUID,
    sport_seeds: tuple[SportSeed, ...],
) -> None:
    for sp_seed in sport_seeds:
        res = await db.execute(
            select(SportProfile).where(
                and_(
                    SportProfile.user_id == user_id,
                    SportProfile.sport == sp_seed.sport,
                )
            )
        )
        sp = res.scalar_one_or_none()
        if sp is None:
            db.add(
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


async def _ensure_identity_preferences(db: AsyncSession, *, user_id: UUID) -> None:
    res = await db.execute(select(IdentityPreferences).where(IdentityPreferences.user_id == user_id))
    if res.scalar_one_or_none() is None:
        db.add(IdentityPreferences(user_id=user_id))


async def _ensure_challenge(
    db: AsyncSession,
    *,
    challenger_id: UUID,
    opponent_id: UUID,
    sport: str,
    area: str,
    note: str | None,
    accept_after_create: bool,
) -> tuple[bool, str]:
    """Idempotently ensure a (challenger, opponent, sport) challenge exists.

    Returns ``(created, status)``. When a row with the same
    ``(challenger_user_id, opponent_user_id, sport)`` already exists,
    the seed leaves its state alone — the reviewer might be mid-flow
    on it (e.g. already submitted a result). When the row is new,
    we drive creation through the canonical
    :func:`app.services.challenges.create_challenge` so all server-side
    validation and timestamp behaviour matches a real user flow. If
    ``accept_after_create`` is set, we also drive
    :func:`accept_challenge` from the opponent's perspective to land
    on ``status=accepted`` — the only state where the mobile picker
    surfaces the "Submit result" form.

    Rank / Honor is never touched here — only the result-submission
    path can fire that, and we deliberately do not call it from a seed
    (faking a verified result would mutate Rank without a real match).
    """
    existing = (
        (
            await db.execute(
                select(SportsChallenge).where(
                    SportsChallenge.challenger_user_id == challenger_id,
                    SportsChallenge.opponent_user_id == opponent_id,
                    SportsChallenge.sport == sport,
                )
            )
        )
        .scalars()
        .first()
    )
    if existing is not None:
        return False, existing.status

    created = await create_challenge(
        db,
        current_user_id=challenger_id,
        opponent_user_id=opponent_id,
        sport=sport,
        area=area,
        note=note,
    )
    if not accept_after_create:
        return True, "pending"

    accepted = await accept_challenge(db, current_user_id=opponent_id, challenge_id=created.id)
    return True, accepted.status


async def _ensure_mutual_match(
    db: AsyncSession,
    *,
    reviewer_id: UUID,
    partner_id: UUID,
    sport: str,
) -> bool:
    """Drive a mutual like through the real discovery service so the
    Match row is created by the canonical code path. Returns ``True``
    if a new Match row was created on this call."""
    # Pre-existing match? The service no-ops on a duplicate, but
    # checking here avoids two extra round-trips.
    u1_str, u2_str = sorted([str(reviewer_id), str(partner_id)])
    u1, u2 = UUID(u1_str), UUID(u2_str)
    existing = (
        await db.execute(select(Match).where(and_(Match.user1_id == u1, Match.user2_id == u2, Match.sport == sport)))
    ).scalar_one_or_none()
    if existing is not None:
        return False

    # Two reciprocal likes; the second one resolves to a mutual match.
    await record_action(db, reviewer_id, partner_id, action="like", sport=sport)
    await record_action(db, partner_id, reviewer_id, action="like", sport=sport)
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def _seed() -> int:
    _assert_local_env()
    settings = get_settings()
    engine = create_async_engine(settings.async_postgres_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    summary = {
        "reviewer_created": False,
        "reviewer_display_name_was": None,  # type: str | None
        "demo_users_created": 0,
        "demo_users_updated": 0,
        "matches_created": 0,
        "matches_existing": 0,
        "challenges_created": 0,
        "challenges_existing": 0,
        "skipped_sports": [],  # type: list[str]
    }

    # Map demo partner email → user id once the loop populates it so the
    # challenge-seed block below can pick the right opponents without
    # re-querying. Keyed by email because it's the only stable identifier
    # we already have in the seed config.
    partner_ids_by_email: dict[str, UUID] = {}

    async with Session() as db:
        # --- Reviewer -----------------------------------------------------
        reviewer, reviewer_created = await _get_or_create_user(
            db,
            email=REVIEWER_EMAIL,
            hashed_password=hash_password(REVIEWER_PASSWORD),
        )
        summary["reviewer_created"] = reviewer_created
        _, prev_name = await _upsert_profile(
            db,
            user_id=reviewer.id,
            display_name=REVIEWER_DISPLAY_NAME,
            birth_year=REVIEWER_BIRTH_YEAR,
            suburb=REVIEWER_SUBURB,
            bio=REVIEWER_BIO,
        )
        summary["reviewer_display_name_was"] = prev_name
        await _upsert_sport_profiles(db, user_id=reviewer.id, sport_seeds=REVIEWER_SPORTS)
        await _ensure_identity_preferences(db, user_id=reviewer.id)
        await db.commit()

        # --- Demo partners + mutual matches -------------------------------
        for seed in _DEMO_USERS:
            partner, created = await _get_or_create_user(db, email=seed.email, hashed_password=None)
            if created:
                summary["demo_users_created"] += 1
            else:
                summary["demo_users_updated"] += 1
            partner_ids_by_email[seed.email] = partner.id
            await _upsert_profile(
                db,
                user_id=partner.id,
                display_name=seed.display_name,
                birth_year=seed.birth_year,
                suburb=seed.suburb,
                bio=seed.bio,
            )
            await _upsert_sport_profiles(db, user_id=partner.id, sport_seeds=seed.sport_profiles)
            await _ensure_identity_preferences(db, user_id=partner.id)
            await db.commit()

            match_created = await _ensure_mutual_match(
                db,
                reviewer_id=reviewer.id,
                partner_id=partner.id,
                sport=seed.match_sport,
            )
            if match_created:
                summary["matches_created"] += 1
            else:
                summary["matches_existing"] += 1

        # --- Demo challenges ----------------------------------------------
        # Two visible states so the reviewer hits both Challenge surfaces:
        #
        #   1. Jordan → Reviewer (tennis, Glebe), status="pending".
        #      Reviewer is the opponent → lands in the "Awaiting your
        #      response" section with Accept / Decline buttons.
        #   2. Sam → Reviewer (running, Camperdown), status="accepted".
        #      Reviewer is the opponent of an accepted challenge →
        #      lands in the "Active" section with the inline
        #      Submit-result form available.
        #
        # Both seeds intentionally cast the *reviewer* as the opponent
        # so the reviewer immediately sees actionable UI on landing
        # (Accept/Decline + Submit form). The "Sent" / "You challenged"
        # variant is reachable from the same seed by tapping Cancel
        # on the pending row.
        challenge_seeds = [
            {
                "partner_email": "jordan.local@sportsgang.app",
                "sport": "tennis",
                "area": "Glebe",
                "note": "Saturday hit at Camperdown?",
                "accept_after_create": False,
            },
            {
                "partner_email": "sam.local@sportsgang.app",
                "sport": "running",
                "area": "Camperdown",
                "note": "Sunday long run — meet at Sydney Park gates.",
                "accept_after_create": True,
            },
        ]
        for spec in challenge_seeds:
            partner_id = partner_ids_by_email.get(spec["partner_email"])
            if partner_id is None:
                continue
            created_flag, _status = await _ensure_challenge(
                db,
                challenger_id=partner_id,
                opponent_id=reviewer.id,
                sport=spec["sport"],
                area=spec["area"],
                note=spec["note"],
                accept_after_create=spec["accept_after_create"],
            )
            if created_flag:
                summary["challenges_created"] += 1
            else:
                summary["challenges_existing"] += 1

    await engine.dispose()

    # ---- Summary -----------------------------------------------------
    print("[seed_local_review_data] done.")
    print(f"  reviewer: {REVIEWER_EMAIL} ({'created' if summary['reviewer_created'] else 'updated'})")
    if summary["reviewer_display_name_was"]:
        print(
            f"  reviewer display_name was {summary['reviewer_display_name_was']!r} → reset to {REVIEWER_DISPLAY_NAME!r}"
        )
    print(f"  demo users:   created={summary['demo_users_created']} updated={summary['demo_users_updated']}")
    print(f"  matches:      created={summary['matches_created']} existing={summary['matches_existing']}")
    print(f"  challenges:   created={summary['challenges_created']} existing={summary['challenges_existing']}")
    print(f"  reviewer credentials: email={REVIEWER_EMAIL} password={REVIEWER_PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_seed()))
