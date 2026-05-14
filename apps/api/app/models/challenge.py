"""
Sports Challenge models.

Backs the verified-result MVP: two users agree on a match, both submit
the outcome, and only matching submissions trigger the existing
service-only :func:`app.services.honor_system.record_match_result_for_honor`
hook. Any disagreement marks the challenge ``disputed`` and the rank /
honor state stays untouched.

Status vocabulary is intentionally a plain string column (not a DB enum)
so adding a new state — e.g. ``expired`` — is an append-only change
that does not require a migration. The service layer is the source of
truth for which transitions are legal.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Allowed status values. Validated in the service layer.
#
#   pending    — created, opponent has not yet acted
#   accepted   — opponent agreed; result submissions now allowed
#   declined   — opponent rejected; terminal
#   cancelled  — challenger withdrew; terminal
#   verified   — both participants submitted matching results;
#                rank/honor was applied exactly once; terminal
#   disputed   — both participants submitted conflicting results;
#                rank/honor stays untouched; terminal
CHALLENGE_STATUSES: frozenset[str] = frozenset(
    {"pending", "accepted", "declined", "cancelled", "verified", "disputed"}
)

# Statuses where the challenge is open to action by either side.
CHALLENGE_ACTIVE_STATUSES: frozenset[str] = frozenset({"pending", "accepted"})

# Terminal statuses — no further mutation allowed by the service layer.
CHALLENGE_TERMINAL_STATUSES: frozenset[str] = frozenset(
    {"declined", "cancelled", "verified", "disputed"}
)


class SportsChallenge(Base):
    """
    A peer-to-peer challenge for a single match in a (sport, area).

    The CHECK constraint enforces challenger != opponent at the DB
    level so a buggy service or direct INSERT cannot create a
    self-challenge. The service layer enforces the lifecycle (only
    ``pending`` accepts/declines/cancels; only ``accepted`` allows
    result submissions; the four terminal states reject everything).
    """

    __tablename__ = "sports_challenges"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    challenger_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    opponent_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sport: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    area: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", index=True
    )
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "challenger_user_id <> opponent_user_id",
            name="ck_sports_challenges_distinct_users",
        ),
    )


class ChallengeResultSubmission(Base):
    """
    A single participant's reported result for a challenge.

    One submission per (challenge, submitted_by_user_id) — the unique
    constraint prevents a participant from voting twice, which would
    otherwise let a single user manufacture a "verified" agreement.

    The (winner, loser) pair must match the challenge's two participants
    exactly — enforced in the service layer (DB cross-table check
    constraints would require a trigger and are not part of the repo's
    style). The CHECK here only pins the cheaper invariant that winner
    and loser differ.
    """

    __tablename__ = "challenge_result_submissions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    challenge_id: Mapped[UUID] = mapped_column(
        ForeignKey("sports_challenges.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    submitted_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    winner_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    loser_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "challenge_id",
            "submitted_by_user_id",
            name="uq_challenge_submissions_per_user",
        ),
        CheckConstraint(
            "winner_user_id <> loser_user_id",
            name="ck_challenge_submissions_distinct_winner_loser",
        ),
    )
