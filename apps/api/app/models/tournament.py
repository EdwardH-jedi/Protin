from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Status vocabulary, kept as plain strings for the same reason rank reasons
# are: append-only changes don't need a DB migration. Validated in the
# service layer.
#
#   draft       — created but not yet visible to users (V2.1 use)
#   open        — accepting joins
#   full        — capacity reached; auto-transitioned from open
#   closed      — registration cut off but tournament has not run yet
#   completed   — tournament happened
#   cancelled   — organizer cancelled
TOURNAMENT_STATUSES: frozenset[str] = frozenset(
    {"draft", "open", "full", "closed", "completed", "cancelled"}
)


class Tournament(Base):
    __tablename__ = "tournaments"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organizer_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    sport: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(1000))
    area: Mapped[Optional[str]] = mapped_column(String(80))
    venue_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("venues.id", ondelete="SET NULL"), nullable=True, index=True
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("capacity >= 2", name="ck_tournaments_capacity_min"),
    )


class TournamentParticipant(Base):
    """
    Junction table for users joined into a tournament. The unique
    constraint on (tournament_id, user_id) is the contention point for
    concurrent joins — paired with a row-level lock on the tournament
    row in the service layer, it prevents capacity overruns.
    """

    __tablename__ = "tournament_participants"

    tournament_id: Mapped[UUID] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
