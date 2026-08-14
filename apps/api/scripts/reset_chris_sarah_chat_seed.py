"""Local-only seed reset for the Chris/Sarah real-device chat QA flow.

Why this exists
---------------
Real-device QA of the Chris/Sarah chat ownership flow has been flaky
because the local database can drift from the canonical state QA expects:

* a duplicate Apple-created account can land under a tester's intended
  "Chris" identity (we observed sub=892c1bb5-... / a different match id
  in API logs while the test plan refers to test02@gmail.com / Chris);
* old dev messages can pollute the canonical match;
* duplicate Chris/Sarah matches can exist if a stray double-like fired
  before the canonical pair de-duplication landed.

This script's job is purely to make the LOCAL DB deterministic for QA.
It is read-only by default -- it prints what it sees and stops. Mutations
require explicit flags. It refuses to run unless ``settings.app_env ==
"local"`` AND the configured DB host resolves to localhost.

Run from ``apps/api/``::

    python -m scripts.reset_chris_sarah_chat_seed                  # inspect
    python -m scripts.reset_chris_sarah_chat_seed --reset-messages --seed-messages
    python -m scripts.reset_chris_sarah_chat_seed --delete-suspicious

Flag matrix
-----------
``--reset-messages``     wipe every message in the canonical Chris/Sarah
                         match (no-op if no match exists yet -- pair with
                         ``--ensure-match``).
``--seed-messages``      after reset, insert the three canonical QA
                         messages in order. Implies ``--reset-messages``.
``--ensure-match``       create the canonical Chris/Sarah match if one
                         is missing. Uses canonical (user1=Sarah,
                         user2=Chris) ordering (matches what
                         ``services/discovery`` would produce because
                         Sarah's UUID sorts before Chris's). Default
                         sport = ``gym``; override with ``--sport``.
``--sport SPORT``        sport to scope the match by (default ``gym``).
``--delete-suspicious``  hard-delete the suspicious duplicate user
                         (UUID 892c1bb5-... if present, plus any extra
                         id passed via ``--suspicious-id``). NEVER
                         touches Chris or Sarah. Cascades through every
                         table that references ``users.id`` -- same
                         deletion order as ``DELETE /auth/me``.
``--suspicious-id UUID`` add an extra user id to the suspicious set
                         (repeatable). Useful if a tester observed yet
                         another duplicate Apple signup in API logs.

Safety
------
* Refuses any ``app_env`` other than ``local``.
* Refuses any DB URL whose host is not ``localhost`` / ``127.0.0.1``.
* Default action is read-only inspection. No flags = no mutations.
* Will not delete Chris or Sarah under any flag combination.
* Idempotent: rerunning with the same flags converges on the same
  state, so it's safe to use as a "before-screenshot" reset hook.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from typing import Iterable
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models.booking import Booking
from app.models.chat import Message
from app.models.google_calendar import CalendarBookingSync, GoogleCalendarToken
from app.models.match import DiscoveryAction, Match
from app.models.notification import NotificationEvent, PushToken
from app.models.profile import IdentityPreferences, SportProfile, UserProfile
from app.models.safety import Block, Report
from app.models.user import User

# ---------------------------------------------------------------------------
# Canonical identities for the QA flow.
# ---------------------------------------------------------------------------

CHRIS_EMAIL = "test02@gmail.com"
CHRIS_ID = UUID("9a88ea2b-04b1-441e-ad65-0f35165066f4")
SARAH_EMAIL = "test10@gmail.com"
SARAH_ID = UUID("164ba415-4f43-4eba-9d4c-fc2d032985ff")
EXPECTED_MATCH_ID = UUID("4a63317a-a24f-4c90-aab7-13bd7fe2f9ec")

# user1=Sarah, user2=Chris matches the canonical ordering produced by
# services/discovery.py (sorted lexicographically) and matches the value
# the prior DB investigation already observed for the intended match.
CANONICAL_USER1 = SARAH_ID
CANONICAL_USER2 = CHRIS_ID

DEFAULT_SUSPICIOUS_IDS: tuple[UUID, ...] = (UUID("892c1bb5-e65a-49b4-ba96-bb9549c6b651"),)

CANONICAL_SEED_MESSAGES: list[tuple[UUID, str]] = [
    # Screenshot-safe back-and-forth: Chris opens, Sarah confirms timing,
    # Chris suggests a venue. Replaces an earlier sequence whose final
    # line ("Saturday morning works for me.") read as a closer rather
    # than a CTA, and the parallel-suspicious-user match's "Lets find a
    # court" (no apostrophe) that was leaking into screenshots.
    (CHRIS_ID, "Want to train this weekend?"),
    (SARAH_ID, "This Saturday works for me"),
    (CHRIS_ID, "Let's find a court"),
]

PROTECTED_USER_IDS: frozenset[UUID] = frozenset({CHRIS_ID, SARAH_ID})


# ---------------------------------------------------------------------------
# Safety gates
# ---------------------------------------------------------------------------


def _refuse_non_local_db_or_exit() -> None:
    settings = get_settings()
    if settings.app_env != "local":
        print(
            f"[chat-seed] Refusing to run in app_env={settings.app_env!r}. This script is local/dev only.",
            file=sys.stderr,
        )
        sys.exit(2)

    parsed = urlparse(settings.async_postgres_url)
    host = (parsed.hostname or "").lower()
    if host not in {"localhost", "127.0.0.1", "::1", ""}:
        print(
            f"[chat-seed] Refusing to operate on remote DB host {host!r}. Only localhost is allowed.",
            file=sys.stderr,
        )
        sys.exit(2)


# ---------------------------------------------------------------------------
# Pretty-printing helpers
# ---------------------------------------------------------------------------


def _fmt_user(label: str, user: User | None) -> str:
    if user is None:
        return f"  {label:<10} (NOT FOUND)"
    apple = " apple_sub=set" if user.apple_sub else ""
    pwd = "" if user.hashed_password else " password=NULL"
    return f"  {label:<10} id={user.id} email={user.email} active={user.is_active}{apple}{pwd}"


def _fmt_match(m: Match) -> str:
    return f"  match id={m.id} sport={m.sport} status={m.status} user1={m.user1_id} user2={m.user2_id}"


def _fmt_msg(msg: Message) -> str:
    return f"    msg id={msg.id} match={msg.match_id} sender={msg.sender_id} created={msg.created_at} body={msg.body!r}"


# ---------------------------------------------------------------------------
# Read-only inspection
# ---------------------------------------------------------------------------


async def _load_user_by_email(session: AsyncSession, email: str) -> User | None:
    res = await session.execute(select(User).where(User.email == email))
    return res.scalar_one_or_none()


async def _load_user_by_id(session: AsyncSession, user_id: UUID) -> User | None:
    res = await session.execute(select(User).where(User.id == user_id))
    return res.scalar_one_or_none()


async def _load_profile(session: AsyncSession, user_id: UUID) -> UserProfile | None:
    res = await session.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    return res.scalar_one_or_none()


async def _matches_involving(session: AsyncSession, user_id: UUID) -> list[Match]:
    res = await session.execute(select(Match).where((Match.user1_id == user_id) | (Match.user2_id == user_id)))
    return list(res.scalars().all())


async def _messages_for_match(session: AsyncSession, match_id: UUID) -> list[Message]:
    res = await session.execute(select(Message).where(Message.match_id == match_id).order_by(Message.created_at.asc()))
    return list(res.scalars().all())


async def _find_canonical_match(session: AsyncSession, sport: str) -> Match | None:
    res = await session.execute(
        select(Match).where(
            Match.user1_id == CANONICAL_USER1,
            Match.user2_id == CANONICAL_USER2,
            Match.sport == sport,
        )
    )
    return res.scalar_one_or_none()


async def _find_chris_sarah_matches(session: AsyncSession) -> list[Match]:
    """Every match whose two participants are exactly {Chris, Sarah}, any sport."""
    res = await session.execute(
        select(Match).where(
            ((Match.user1_id == CHRIS_ID) & (Match.user2_id == SARAH_ID))
            | ((Match.user1_id == SARAH_ID) & (Match.user2_id == CHRIS_ID))
        )
    )
    return list(res.scalars().all())


async def inspect(session: AsyncSession, suspicious_ids: Iterable[UUID]) -> dict:
    """Print current DB state. Returns a small summary for callers."""
    chris = await _load_user_by_email(session, CHRIS_EMAIL)
    sarah = await _load_user_by_email(session, SARAH_EMAIL)

    print("[chat-seed] Users:")
    print(_fmt_user("Chris", chris))
    print(_fmt_user("Sarah", sarah))

    if chris is not None:
        prof = await _load_profile(session, chris.id)
        if prof is not None:
            print(
                f"             profile display_name={prof.display_name!r}"
                f" suburb={prof.suburb!r} birth_year={prof.birth_year}"
            )
    if sarah is not None:
        prof = await _load_profile(session, sarah.id)
        if prof is not None:
            print(
                f"             profile display_name={prof.display_name!r}"
                f" suburb={prof.suburb!r} birth_year={prof.birth_year}"
            )

    # Sanity check: if Chris/Sarah are present but their UUIDs differ from
    # the canonical IDs we hardcoded, surface that loudly so QA stops
    # before doing anything destructive.
    if chris is not None and chris.id != CHRIS_ID:
        print(
            f"  [WARN] Chris row id={chris.id} != expected {CHRIS_ID}. Aborting any mutation. Verify your local DB.",
            file=sys.stderr,
        )
    if sarah is not None and sarah.id != SARAH_ID:
        print(
            f"  [WARN] Sarah row id={sarah.id} != expected {SARAH_ID}. Aborting any mutation. Verify your local DB.",
            file=sys.stderr,
        )

    print("[chat-seed] Suspicious / duplicate user candidates:")
    suspicious_found: list[User] = []
    for uid in suspicious_ids:
        u = await _load_user_by_id(session, uid)
        if u is None:
            print(f"  {uid} (not present -- already clean)")
        else:
            print(_fmt_user(str(uid), u))
            suspicious_found.append(u)

    cs_matches = await _find_chris_sarah_matches(session)
    print(f"[chat-seed] Chris/Sarah matches found: {len(cs_matches)}")
    for m in cs_matches:
        print(_fmt_match(m))
        msgs = await _messages_for_match(session, m.id)
        if not msgs:
            print("    (no messages)")
        for msg in msgs:
            print(_fmt_msg(msg))

    expected = next((m for m in cs_matches if m.id == EXPECTED_MATCH_ID), None)
    if expected is None and cs_matches:
        print(
            f"  [INFO] expected match id {EXPECTED_MATCH_ID} not present; a different Chris/Sarah match id is in use."
        )

    # Surface suspicious user's matches/messages too so QA can see how
    # entangled it is before deciding whether to delete it.
    for u in suspicious_found:
        ms = await _matches_involving(session, u.id)
        print(f"[chat-seed] Suspicious {u.id} participates in {len(ms)} match(es):")
        for m in ms:
            print(_fmt_match(m))
            for msg in await _messages_for_match(session, m.id):
                print(_fmt_msg(msg))

    return {
        "chris": chris,
        "sarah": sarah,
        "chris_sarah_matches": cs_matches,
        "suspicious": suspicious_found,
    }


# ---------------------------------------------------------------------------
# Mutations (each gated behind an explicit flag)
# ---------------------------------------------------------------------------


async def ensure_canonical_match(session: AsyncSession, sport: str) -> Match:
    """Return the canonical Chris/Sarah match for ``sport``, creating it
    if absent. If duplicate Chris/Sarah matches exist for the same sport,
    abort -- caller must hand-resolve."""
    cs_matches = await _find_chris_sarah_matches(session)
    same_sport = [m for m in cs_matches if m.sport == sport]
    if len(same_sport) > 1:
        raise RuntimeError(
            f"Found {len(same_sport)} Chris/Sarah matches for sport={sport!r}."
            " Refusing to mutate. Resolve duplicates by hand first."
        )

    if same_sport:
        m = same_sport[0]
        # If the row exists but uses non-canonical ordering, leave it
        # alone. The chat router accepts either ordering -- what matters
        # is the participant set.
        return m

    # Fresh row. Use canonical ordering so it lines up with what the
    # discovery service would produce.
    m = Match(
        user1_id=CANONICAL_USER1,
        user2_id=CANONICAL_USER2,
        sport=sport,
        status="active",
    )
    session.add(m)
    await session.flush()
    print(f"[chat-seed] Created canonical Chris/Sarah match id={m.id} sport={sport}")
    return m


async def reset_messages_for_match(session: AsyncSession, match_id: UUID) -> int:
    """Wipe every message in the match. Returns rows deleted."""
    before = (await session.execute(select(Message).where(Message.match_id == match_id))).scalars().all()
    count = len(list(before))
    if count:
        await session.execute(delete(Message).where(Message.match_id == match_id))
    print(f"[chat-seed] Reset {count} message(s) in match {match_id}")
    return count


async def seed_canonical_messages(session: AsyncSession, match_id: UUID) -> None:
    for sender_id, body in CANONICAL_SEED_MESSAGES:
        session.add(Message(match_id=match_id, sender_id=sender_id, body=body))
        await session.flush()
    print(f"[chat-seed] Seeded {len(CANONICAL_SEED_MESSAGES)} canonical message(s) into match {match_id}")


async def hard_delete_user(session: AsyncSession, user_id: UUID) -> None:
    """Mirror DELETE /auth/me: scrub every table that references ``users.id``
    in dependency order, then delete the user row itself."""
    if user_id in PROTECTED_USER_IDS:
        raise RuntimeError(f"Refusing to delete protected user {user_id} (Chris/Sarah are off-limits).")

    match_ids = [
        row[0]
        for row in (
            await session.execute(select(Match.id).where((Match.user1_id == user_id) | (Match.user2_id == user_id)))
        ).all()
    ]
    booking_ids = [
        row[0]
        for row in (
            await session.execute(
                select(Booking.id).where((Booking.proposer_id == user_id) | (Booking.partner_id == user_id))
            )
        ).all()
    ]

    await session.execute(delete(NotificationEvent).where(NotificationEvent.user_id == user_id))
    await session.execute(delete(PushToken).where(PushToken.user_id == user_id))

    await session.execute(delete(CalendarBookingSync).where(CalendarBookingSync.user_id == user_id))
    if booking_ids:
        await session.execute(delete(CalendarBookingSync).where(CalendarBookingSync.booking_id.in_(booking_ids)))
    await session.execute(delete(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user_id))

    if match_ids:
        await session.execute(delete(Message).where(Message.match_id.in_(match_ids)))
    await session.execute(delete(Message).where(Message.sender_id == user_id))

    if booking_ids:
        await session.execute(delete(Booking).where(Booking.id.in_(booking_ids)))
    if match_ids:
        await session.execute(delete(Match).where(Match.id.in_(match_ids)))

    await session.execute(
        delete(DiscoveryAction).where((DiscoveryAction.actor_id == user_id) | (DiscoveryAction.target_id == user_id))
    )
    await session.execute(delete(Report).where((Report.reporter_id == user_id) | (Report.reported_id == user_id)))
    await session.execute(delete(Block).where((Block.blocker_id == user_id) | (Block.blocked_id == user_id)))
    await session.execute(delete(SportProfile).where(SportProfile.user_id == user_id))
    await session.execute(delete(IdentityPreferences).where(IdentityPreferences.user_id == user_id))
    await session.execute(delete(UserProfile).where(UserProfile.user_id == user_id))
    await session.execute(delete(User).where(User.id == user_id))
    print(f"[chat-seed] Hard-deleted suspicious user {user_id}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--reset-messages", action="store_true")
    p.add_argument("--seed-messages", action="store_true")
    p.add_argument("--ensure-match", action="store_true")
    p.add_argument("--sport", default="gym")
    p.add_argument("--delete-suspicious", action="store_true")
    p.add_argument(
        "--suspicious-id",
        action="append",
        default=[],
        help="Additional UUID to treat as suspicious. Repeatable.",
    )
    return p.parse_args(argv)


async def run(args: argparse.Namespace) -> int:
    settings = get_settings()
    engine = create_async_engine(settings.async_postgres_url)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    suspicious_ids: list[UUID] = list(DEFAULT_SUSPICIOUS_IDS)
    for raw in args.suspicious_id:
        try:
            suspicious_ids.append(UUID(raw))
        except ValueError:
            print(f"[chat-seed] Ignoring invalid --suspicious-id={raw!r}")

    try:
        async with Session() as session:
            print("=== BEFORE ===")
            before = await inspect(session, suspicious_ids)

            chris = before["chris"]
            sarah = before["sarah"]

            mutate = args.reset_messages or args.seed_messages or args.ensure_match or args.delete_suspicious

            if not mutate:
                print("[chat-seed] No mutation flags passed -- inspection only.")
                return 0

            if chris is None or sarah is None:
                print(
                    "[chat-seed] Cannot mutate: Chris and/or Sarah missing."
                    " Create them via the normal /auth/register flow first.",
                    file=sys.stderr,
                )
                return 1
            if chris.id != CHRIS_ID or sarah.id != SARAH_ID:
                print(
                    "[chat-seed] Cannot mutate: Chris/Sarah row ids do not"
                    " match the hardcoded canonical UUIDs. Verify your local"
                    " DB before re-running.",
                    file=sys.stderr,
                )
                return 1

            target_match: Match | None = None
            if args.ensure_match or args.reset_messages or args.seed_messages:
                # ensure_canonical_match is read-only when the row already
                # exists so the explicit --ensure-match flag is just an
                # extra safety: callers can opt-in to creation.
                cs_matches = await _find_chris_sarah_matches(session)
                same_sport = [m for m in cs_matches if m.sport == args.sport]
                if not same_sport:
                    if not args.ensure_match:
                        print(
                            "[chat-seed] No Chris/Sarah match for sport="
                            f"{args.sport!r}. Re-run with --ensure-match to"
                            " create one.",
                            file=sys.stderr,
                        )
                        return 1
                    target_match = await ensure_canonical_match(session, args.sport)
                elif len(same_sport) > 1:
                    print(
                        f"[chat-seed] Found {len(same_sport)} Chris/Sarah"
                        f" matches for sport={args.sport!r}. Refusing to"
                        " mutate. Resolve duplicates by hand first.",
                        file=sys.stderr,
                    )
                    return 1
                else:
                    target_match = same_sport[0]

            if (args.reset_messages or args.seed_messages) and target_match is not None:
                await reset_messages_for_match(session, target_match.id)
            if args.seed_messages and target_match is not None:
                await seed_canonical_messages(session, target_match.id)

            if args.delete_suspicious:
                for u in before["suspicious"]:
                    await hard_delete_user(session, u.id)

            await session.commit()

            print("=== AFTER ===")
            await inspect(session, suspicious_ids)
            return 0
    finally:
        await engine.dispose()


def main() -> None:
    _refuse_non_local_db_or_exit()
    args = _parse_args()
    sys.exit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
