from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class PushToken(Base):
    """
    Device push tokens registered via the Expo push notification service.
    One token per device; a user may have multiple devices.
    """

    __tablename__ = "push_tokens"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Expo push token, e.g. ExponentPushToken[xxxx]
    token: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)
    # ios | android | web
    platform: Mapped[str] = mapped_column(String(20), nullable=False, default="ios")
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )


class NotificationEvent(Base):
    """
    Stores scheduled and sent push notification events.

    Immediate notifications have scheduled_at = now().
    Reminder notifications have scheduled_at = starts_at - 24h.

    A background worker (POST /internal/process-notifications) processes
    rows where scheduled_at <= now() and sent_at is NULL.
    """

    __tablename__ = "notification_events"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    booking_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # proposal_received | booking_confirmed | booking_declined | booking_cancelled | reminder
    notification_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    body: Mapped[str] = mapped_column(String(512), nullable=False)
    # Push token cached at schedule time; may be stale if user re-registers
    push_token: Mapped[str | None] = mapped_column(String(256), nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failed_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
