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

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.event import Event, EventParticipant
from app.models.rank import HONOR_REASONS, RANK_REASONS, HonorEvent, RankEvent
from app.models.safety import Report
from app.schemas.rank import (
    HonorSummary,
    RankSummary,
    SportLevelSummary,
    SportRankSummary,
)

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


# ---------------------------------------------------------------------------
# V1.1 Honor / Gang Score / Sport Level — computed read model.
#
# Source data:
#   * EventParticipant rows for the user, where the host confirmed
#     attendance (attendance_confirmed_by_host_at IS NOT NULL).
#   * Event rows hosted by the user — exclude cancelled events; gate
#     the hosted bonus on host having confirmed at least one OTHER
#     active participant on that event.
#   * Report rows with target_type='user', reported_id=user, and
#     status='actioned'.
#
# Idempotence is structural: nothing is mutated on attendance updates;
# the next read reflects the latest state. Self-reports alone never
# move the score because we require the host-confirmation timestamp.
# ---------------------------------------------------------------------------

HONOR_BASELINE_V11: int = 100
HONOR_FLOOR_V11: int = 0
HONOR_CEILING_V11: int = 999

# Per-record deltas — see brief for the full table.
_HONOR_DELTA_ATTENDED: int = 2
_HONOR_DELTA_NO_SHOW: int = -20
_HONOR_DELTA_EXCUSED: int = 0
_HONOR_DELTA_REPORT_ACTIONED: int = -30

_GANG_DELTA_ATTENDED: int = 10
_GANG_DELTA_HOSTED_EVENT: int = 15

_SPORT_XP_ATTENDED: int = 10
_SPORT_XP_HOSTED: int = 5

# Honor band thresholds. Descending order so the first match wins.
_HONOR_LEVEL_BANDS: list[tuple[int, str]] = [
    (220, "Legend"),
    (150, "Captain"),
    (110, "Trusted"),
    (80, "Regular"),
    (0, "Rookie"),
]


def honor_level_for(honor_score: int) -> str:
    for lower, label in _HONOR_LEVEL_BANDS:
        if honor_score >= lower:
            return label
    return "Rookie"


def sport_level_for(xp: int) -> int:
    """level = 1 + floor(xp / 50), capped at 99 and floored at 1."""
    if xp <= 0:
        return 1
    return min(99, 1 + xp // 50)


async def compute_honor_summary(
    db: AsyncSession, user_id: UUID
) -> HonorSummary:
    """
    Compute Honor / Gang Score / Sport Levels for a single user.

    Deterministic and idempotent — never mutates ledger rows. Result
    reflects the current state of EventParticipant, Event, and Report.
    """
    # --- Participation aggregates (scoreable rows only) -----------------
    #
    # A row only contributes to player credit (attended/no_show/excused)
    # when ALL of these hold:
    #   * EventParticipant.status == "joined"            (lifecycle gate;
    #     a user who left mid-event must not be penalized as a no_show)
    #   * Event.status != "cancelled"                    (no credit or
    #     penalty from a cancelled event)
    #   * attendance_confirmed_by_host_at is not null    (self-reports
    #     alone never move the score)
    #   * EventParticipant.user_id != Event.host_user_id (host's own
    #     auto-joined row is host bonus territory, not player credit —
    #     prevents a host farming Honor/Gang/Sport XP by marking only
    #     themselves)
    #
    # Pending is also gated on the lifecycle + non-cancelled event so
    # the UI counter doesn't include orphan rows from cancelled events
    # or left users. Pending itself is inert for score; the gate just
    # keeps the counter honest.
    scoreable_filter = (
        (EventParticipant.user_id == user_id)
        & (EventParticipant.status == "joined")
        & (Event.status != "cancelled")
        & (EventParticipant.user_id != Event.host_user_id)
    )

    attended_rows_stmt = (
        select(Event.sport, func.count(EventParticipant.id))
        .join(Event, Event.id == EventParticipant.event_id)
        .where(
            scoreable_filter,
            EventParticipant.attendance_confirmed_by_host_at.is_not(None),
            EventParticipant.attendance_status == "attended",
        )
        .group_by(Event.sport)
    )
    attended_by_sport: dict[str, int] = {
        sport: int(count)
        for sport, count in (await db.execute(attended_rows_stmt)).all()
    }
    completed_games_count = sum(attended_by_sport.values())

    def _count_by_attendance(att_status: str, *, require_confirmation: bool) -> select:
        stmt = (
            select(func.count(EventParticipant.id))
            .join(Event, Event.id == EventParticipant.event_id)
            .where(
                scoreable_filter,
                EventParticipant.attendance_status == att_status,
            )
        )
        if require_confirmation:
            stmt = stmt.where(
                EventParticipant.attendance_confirmed_by_host_at.is_not(None)
            )
        return stmt

    no_show_count = int(
        (
            await db.execute(
                _count_by_attendance("no_show", require_confirmation=True)
            )
        ).scalar_one()
    )
    excused_count = int(
        (
            await db.execute(
                _count_by_attendance("excused", require_confirmation=True)
            )
        ).scalar_one()
    )
    # Pending stays inert for score — the gate is here only so the UI
    # counter reflects active, non-cancelled, non-host rows.
    pending_count = int(
        (
            await db.execute(
                _count_by_attendance("pending", require_confirmation=False)
            )
        ).scalar_one()
    )

    # --- Hosted events (once-per-event bonus) ---------------------------
    #
    # Bonus condition: the user hosts the event, the event is not
    # cancelled, and at least one NON-host EventParticipant on that
    # event has host-confirmed attended. EXISTS keeps it
    # double-count-safe — one row per qualifying event.
    other_participant_attended = (
        select(EventParticipant.id)
        .where(
            EventParticipant.event_id == Event.id,
            EventParticipant.user_id != Event.host_user_id,
            # Active lifecycle gate — a non-host who left the event
            # (status='left') must NOT count as the qualifying attended
            # participant for the hosted bonus, even if their soft-left
            # audit row carries a host-confirmed attended mark.
            EventParticipant.status == "joined",
            EventParticipant.attendance_status == "attended",
            EventParticipant.attendance_confirmed_by_host_at.is_not(None),
        )
        .exists()
    )
    hosted_events_stmt = (
        select(Event.id, Event.sport)
        .where(
            Event.host_user_id == user_id,
            Event.status != "cancelled",
            other_participant_attended,
        )
    )
    hosted_rows = list((await db.execute(hosted_events_stmt)).all())
    hosted_games_count = len(hosted_rows)
    hosted_by_sport: dict[str, int] = {}
    for _event_id, sport in hosted_rows:
        hosted_by_sport[sport] = hosted_by_sport.get(sport, 0) + 1

    # --- Actioned-report penalty ----------------------------------------
    #
    # Only the actioned status moves the score — submitted, reviewed,
    # and dismissed are inert. Event-target reports do not apply here
    # because the brief penalty wording is specifically "Actioned USER
    # report against the user".
    actioned_reports_count = int(
        (
            await db.execute(
                select(func.count(Report.id)).where(
                    Report.reported_id == user_id,
                    Report.target_type == "user",
                    Report.status == "actioned",
                )
            )
        ).scalar_one()
    )

    # --- Roll up Honor + Gang Score -------------------------------------
    honor = HONOR_BASELINE_V11
    honor += completed_games_count * _HONOR_DELTA_ATTENDED
    honor += no_show_count * _HONOR_DELTA_NO_SHOW
    honor += excused_count * _HONOR_DELTA_EXCUSED
    honor += actioned_reports_count * _HONOR_DELTA_REPORT_ACTIONED
    honor_score = _clamp(honor, HONOR_FLOOR_V11, HONOR_CEILING_V11)

    gang_score = (
        completed_games_count * _GANG_DELTA_ATTENDED
        + hosted_games_count * _GANG_DELTA_HOSTED_EVENT
    )

    # --- Per-sport XP + level -------------------------------------------
    sport_keys = set(attended_by_sport.keys()) | set(hosted_by_sport.keys())
    sport_levels: list[SportLevelSummary] = []
    for sport in sorted(sport_keys):
        a = attended_by_sport.get(sport, 0)
        h = hosted_by_sport.get(sport, 0)
        xp = a * _SPORT_XP_ATTENDED + h * _SPORT_XP_HOSTED
        sport_levels.append(
            SportLevelSummary(
                sport=sport,
                xp=xp,
                level=sport_level_for(xp),
                attended_count=a,
                hosted_count=h,
            )
        )

    return HonorSummary(
        user_id=user_id,
        honor_score=honor_score,
        honor_level=honor_level_for(honor_score),
        gang_score=gang_score,
        completed_games_count=completed_games_count,
        hosted_games_count=hosted_games_count,
        no_show_count=no_show_count,
        excused_count=excused_count,
        pending_count=pending_count,
        sport_levels=sport_levels,
        generated_at=datetime.now(tz=timezone.utc),
    )
