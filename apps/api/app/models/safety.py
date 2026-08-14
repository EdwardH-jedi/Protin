from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base

# Moderation lifecycle for a report. Only "actioned" feeds Honor; the
# others are inert. Service-layer validates the vocabulary; the DB
# column is a free-form String so new states do not require migrations.
REPORT_STATUSES: frozenset[str] = frozenset({"submitted", "reviewed", "dismissed", "actioned"})
REPORT_TARGET_TYPES: frozenset[str] = frozenset({"user", "event"})


class Report(Base):
    """
    A user-submitted report.

    V1.1 contract:
      - target_type='user'  → `reported_id` is set (legacy column name).
      - target_type='event' → `target_event_id` is set; `reported_id`
        may be null OR pinned to the event's host.
    Stored for moderation review — no automated action is taken. The
    rank service reads only target_type='user' rows with
    status='actioned' for the Honor penalty.
    """

    __tablename__ = "reports"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    reporter_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_type: Mapped[str] = mapped_column(String(20), nullable=False, default="user", server_default="user")
    # Relaxed to nullable in V1.1 so target_type='event' reports may
    # omit a user target. Legacy user reports keep populating it.
    reported_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    target_event_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # spam | inappropriate | fake | harassment | other  (legacy)
    # | no_show | fraud_or_scam | inappropriate_chat | fake_profile
    # | unsafe_behavior (V1.1)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="submitted", server_default="submitted")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Block(Base):
    """
    A user-initiated block. Blocks are bidirectional in effect:
    discovery and chat are hidden for both parties.

    The row is directional (blocker→blocked) so we know who initiated.
    """

    __tablename__ = "blocks"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    blocker_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    blocked_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("blocker_id", "blocked_id", name="uq_blocks_blocker_blocked"),)
