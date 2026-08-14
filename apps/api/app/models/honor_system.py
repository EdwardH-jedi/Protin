"""
Honor System MVP — per-(user, sport, area) rank profile, per-(sport,
area, title_name) honor title, and an append-only ledger of every
title transfer.

Distinct from the ledger-style rank/honor in :mod:`app.models.rank`,
which folds append-only event rows into a public-safe summary on read.
The Honor System stores the *aggregate* leaderboard state and the
championship-style title state directly, because clients page through
sorted leaderboards and we don't want to re-fold the ledger on every
read.

Match-result integration is deliberately out of scope for the MVP —
:func:`app.services.honor_system.record_match_result_for_honor` is the
single write path, exposed today via a thin authenticated endpoint and
ready to be called from a future verified-result hook (challenge,
tournament, group event) without further schema changes.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Starting rating for a new rank profile. ELO-style midpoint so a brand
# new user is neither at the floor nor the ceiling.
DEFAULT_RATING: int = 1000

# Rating deltas applied by ``record_match_result_for_honor``. Kept as
# module-level constants so tests can import them and so tuning the
# economy is a one-line change.
RATING_WIN_DELTA: int = 20
RATING_LOSS_DELTA: int = 10

# Lower bound — the loser's rating clamps here rather than going
# negative. No upper bound for MVP.
RATING_FLOOR: int = 0


class RankProfile(Base):
    """
    Aggregate rank state for one user in one (sport, area).

    Persisted (not derived) because the leaderboard endpoint sorts by
    ``rating`` desc and pages through. Folding the rank event ledger on
    every request would not scale once the area has thousands of
    profiles. The trade-off is that this row is the source of truth for
    leaderboard position and must be updated in the same transaction as
    any result emission.
    """

    __tablename__ = "rank_profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sport: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    area: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False, default=DEFAULT_RATING)
    wins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    losses: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Winning-streak counter. Increments on a win, resets to 0 on a
    # loss. Kept positive-only for MVP so the UI can show "5 in a row"
    # without an extra sign-handling rule.
    streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_played_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "sport", "area", name="uq_rank_profiles_user_sport_area"),
        CheckConstraint("rating >= 0", name="ck_rank_profiles_rating_min"),
        CheckConstraint("wins >= 0", name="ck_rank_profiles_wins_min"),
        CheckConstraint("losses >= 0", name="ck_rank_profiles_losses_min"),
        CheckConstraint("streak >= 0", name="ck_rank_profiles_streak_min"),
    )


class HonorTitle(Base):
    """
    Local-honor championship title (e.g. "Annandale Tennis Champion").

    Identity is the triple ``(sport, area, title_name)`` — multiple
    titles per (sport, area) are physically possible (e.g. a future
    "Doubles" variant), but the MVP service only auto-creates one
    canonical title per (sport, area) using the generated name, so in
    practice there is exactly one row per (sport, area).

    ``current_holder_user_id`` is nullable so a title can briefly exist
    with no holder. The FK ``ON DELETE SET NULL`` clears the pointer if
    the holder's account is removed, without dropping the title row
    itself.

    ``active`` is a soft flag for future deactivation (e.g. retiring a
    title). It defaults to True and is informational only — the unique
    constraint covers all rows regardless of the flag, which is the
    closest clean equivalent to a partial-unique index in this repo's
    Postgres+SQLite-test setup.
    """

    __tablename__ = "honor_titles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    sport: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    area: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    title_name: Mapped[str] = mapped_column(String(120), nullable=False)
    current_holder_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (UniqueConstraint("sport", "area", "title_name", name="uq_honor_titles_sport_area_name"),)


class HonorHistory(Base):
    """
    Append-only ledger of every title transfer.

    ``previous_holder_user_id`` is nullable so the initial award (when
    nobody held the title yet) can be recorded with a ``NULL`` source.
    The row is written in the same transaction as the holder flip on
    :class:`HonorTitle`, so the ledger and the title row are always
    consistent.

    ``source_match_id`` is intentionally a plain nullable UUID (no FK).
    The repo does not yet have a match-result model — when one lands,
    a follow-up migration can add the FK without breaking historical
    rows that pre-date it.
    """

    __tablename__ = "honor_history"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    honor_title_id: Mapped[UUID] = mapped_column(
        ForeignKey("honor_titles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    previous_holder_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    new_holder_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_match_id: Mapped[UUID | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "previous_holder_user_id IS NULL OR previous_holder_user_id <> new_holder_user_id",
            name="ck_honor_history_distinct_users",
        ),
    )
