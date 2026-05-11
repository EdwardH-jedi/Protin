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
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Status vocabulary kept as plain strings (no DB enum) so adding new
# values like "started" later does not require a migration. Service
# layer validates allowed transitions.
EVENT_STATUSES: frozenset[str] = frozenset(
    {"open", "full", "cancelled", "completed"}
)
EVENT_MODES: frozenset[str] = frozenset({"casual", "ranked"})
EVENT_VISIBILITIES: frozenset[str] = frozenset({"public", "private"})
EVENT_PARTICIPANT_STATUSES: frozenset[str] = frozenset({"joined", "left"})


class Event(Base):
    """
    Group event ("battle" / "game") that one host opens and other users
    can join. Distinct from ``Booking`` (1:1 partner session) and
    ``Tournament`` (multi-round structured competition).
    """

    __tablename__ = "events"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    host_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    sport: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="casual")
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    location_text: Mapped[str] = mapped_column(String(200), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="public")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("capacity >= 1", name="ck_events_capacity_min"),
    )


class EventParticipant(Base):
    """
    Soft join: rows are not deleted on leave so we keep an audit trail
    (future no-show / attendance stream consumes this).
    """

    __tablename__ = "event_participants"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="joined")
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    left_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        # One active "joined" row per (event, user) is enforced in the
        # service layer rather than a partial index, so the constraint
        # works identically on SQLite (tests) and Postgres (prod).
        UniqueConstraint("event_id", "user_id", "status", name="uq_event_participants_event_user_status"),
    )
