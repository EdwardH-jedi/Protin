"""
Sports Reputation: rank + honor.

Single entry point for emitting events: ``record_booking_transition``.
Booking FSM transitions call into here; this module owns the policy
about which deltas land where, and the summary computation that
endpoints serve.

Honesty principles, restated from the V2 plan and brief:
  * Tier is *computed* from rank points, never stored. Avoiding a
    third source of truth keeps state in sync.
  * The booking FSM lets either party mark `no_show`. To deter false
    claims, the user who calls no_show *also* takes a smaller honor
    penalty. This is not a substitute for a real dispute window; it's
    the cheapest game-theoretic mitigation that doesn't require a new
    booking state. Document the limitation in product copy.
  * Public summary never exposes negative-event breakdowns or the
    event log. Only the bounded honor score and per-sport positives.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.rank import HONOR_REASONS, RANK_REASONS, HonorEvent, RankEvent
from app.schemas.rank import RankSummary, SportRankSummary

# ---------------------------------------------------------------------------
# Tunables — kept module-level for easy tuning + test overrides if needed.
# ---------------------------------------------------------------------------

HONOR_BASELINE: int = 100
HONOR_FLOOR: int = 0
HONOR_CEILING: int = 200

HONOR_DELTA_SESSION_COMPLETED: int = 1
HONOR_DELTA_NO_SHOW_AGAINST_USER: int = -5
HONOR_DELTA_NO_SHOW_MARKED_BY_USER: int = -2
HONOR_DELTA_LATE_CANCELLATION: int = -1

RANK_DELTA_SESSION_COMPLETED: int = 5

# Tier thresholds. Each tuple is (label, lower_bound). Sorted descending
# by bound so the first match wins. "Rookie" is the floor.
_TIER_BANDS: list[tuple[str, int]] = [
    ("Diamond", 1000),
    ("Platinum", 400),
    ("Gold", 150),
    ("Silver", 50),
    ("Bronze", 10),
    ("Rookie", 0),
]


def compute_tier(rank_points: int) -> str:
    """Tier band for a rank-points integer. Pure function for tests."""
    for label, lower in _TIER_BANDS:
        if rank_points >= lower:
            return label
    return "Rookie"


# ---------------------------------------------------------------------------
# Event emission — called by the booking FSM. Each helper appends rows but
# does NOT commit; the caller is responsible for the surrounding transaction.
# ---------------------------------------------------------------------------


def _validate_honor_reason(reason: str) -> None:
    if reason not in HONOR_REASONS:
        raise ValueError(f"Unknown honor reason: {reason}")


def _validate_rank_reason(reason: str) -> None:
    if reason not in RANK_REASONS:
        raise ValueError(f"Unknown rank reason: {reason}")


async def _record_honor(
    db: AsyncSession,
    user_id: UUID,
    delta: int,
    reason: str,
    booking_id: UUID | None,
) -> None:
    _validate_honor_reason(reason)
    db.add(
        HonorEvent(
            user_id=user_id, delta=delta, reason=reason, booking_id=booking_id
        )
    )


async def _record_rank(
    db: AsyncSession,
    user_id: UUID,
    sport: str,
    delta: int,
    reason: str,
    booking_id: UUID | None,
) -> None:
    _validate_rank_reason(reason)
    db.add(
        RankEvent(
            user_id=user_id,
            sport=sport,
            delta=delta,
            reason=reason,
            booking_id=booking_id,
        )
    )


async def record_booking_transition(
    db: AsyncSession,
    booking: Booking,
    previous_status: str,
    new_status: str,
    actor_user_id: UUID,
) -> None:
    """
    Single hook called by the booking FSM after a successful transition.

    Decides what events (if any) to emit. Does not commit — the caller
    owns the transaction.

    Policy:
      confirmed -> completed:
        +HONOR_DELTA_SESSION_COMPLETED to both participants
        +RANK_DELTA_SESSION_COMPLETED  to both participants (sport-specific)

      confirmed -> no_show:
        HONOR_DELTA_NO_SHOW_AGAINST_USER     to the OTHER participant
        HONOR_DELTA_NO_SHOW_MARKED_BY_USER   to the actor (anti-abuse)
        (no rank change — play didn't happen)

      confirmed -> cancelled:
        HONOR_DELTA_LATE_CANCELLATION to the actor
        (cancelling a confirmed booking is a reliability cost; cancelling
         a `proposed` booking is not, since no commitment was made.)
    """
    other_id = (
        booking.partner_id if booking.proposer_id == actor_user_id else booking.proposer_id
    )

    if previous_status == "confirmed" and new_status == "completed":
        for participant_id in (booking.proposer_id, booking.partner_id):
            await _record_honor(
                db,
                participant_id,
                HONOR_DELTA_SESSION_COMPLETED,
                "session_completed",
                booking.id,
            )
            await _record_rank(
                db,
                participant_id,
                booking.sport,
                RANK_DELTA_SESSION_COMPLETED,
                "session_completed",
                booking.id,
            )

    elif previous_status == "confirmed" and new_status == "no_show":
        await _record_honor(
            db,
            other_id,
            HONOR_DELTA_NO_SHOW_AGAINST_USER,
            "no_show_against_user",
            booking.id,
        )
        await _record_honor(
            db,
            actor_user_id,
            HONOR_DELTA_NO_SHOW_MARKED_BY_USER,
            "no_show_marked_by_user",
            booking.id,
        )

    elif previous_status == "confirmed" and new_status == "cancelled":
        await _record_honor(
            db,
            actor_user_id,
            HONOR_DELTA_LATE_CANCELLATION,
            "late_cancellation",
            booking.id,
        )

    # All other transitions (proposed -> *) intentionally emit nothing.


# ---------------------------------------------------------------------------
# Summary computation — read path served by /users/me/rank-summary and
# /users/{id}/rank-summary. Cheap enough for V2.0 to compute on the fly;
# promote to a materialized cache only if profile-load latency demands.
# ---------------------------------------------------------------------------


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


async def compute_summary(db: AsyncSession, user_id: UUID) -> RankSummary:
    # Honor: baseline + sum(deltas), clamped to [HONOR_FLOOR, HONOR_CEILING].
    honor_sum_stmt = select(func.coalesce(func.sum(HonorEvent.delta), 0)).where(
        HonorEvent.user_id == user_id
    )
    honor_total = (await db.execute(honor_sum_stmt)).scalar_one()
    honor_score = _clamp(HONOR_BASELINE + int(honor_total), HONOR_FLOOR, HONOR_CEILING)

    # Per-sport rank: group rank events by sport, sum positives. Also
    # surface a `sessions_completed` count derived from the same rows
    # (one rank event per completed session today; stable invariant).
    # Contract: today every RANK_REASONS entry emits delta > 0, so the
    # filter is a no-op load-bearing only as a defense if a future negative
    # rank reason is added. Keep it: `count(id)` would otherwise treat a
    # negative event as a "completed session" and undercount silently.
    sport_rows_stmt = (
        select(
            RankEvent.sport,
            func.coalesce(func.sum(RankEvent.delta), 0),
            func.count(RankEvent.id),
        )
        .where(RankEvent.user_id == user_id, RankEvent.delta > 0)
        .group_by(RankEvent.sport)
        .order_by(func.sum(RankEvent.delta).desc())
    )
    sports: list[SportRankSummary] = []
    for sport, points_sum, sessions in (await db.execute(sport_rows_stmt)).all():
        points_int = int(points_sum)
        sports.append(
            SportRankSummary(
                sport=sport,
                rank_points=points_int,
                tier=compute_tier(points_int),
                sessions_completed=int(sessions),
            )
        )

    return RankSummary(honor=honor_score, sports=sports)
