"""google calendar tokens, notifications, safety (reports + blocks)

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Google Calendar ──────────────────────────────────────────────────────

    op.create_table(
        "google_calendar_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("access_token", sa.String(2048), nullable=False),
        sa.Column("refresh_token", sa.String(512), nullable=False),
        sa.Column("token_expiry", sa.DateTime(timezone=True), nullable=False),
        sa.Column("calendar_id", sa.String(256), nullable=False, server_default="primary"),
        sa.Column("connected_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_google_calendar_tokens_user_id", "google_calendar_tokens", ["user_id"])

    op.create_table(
        "calendar_booking_syncs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("booking_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("google_event_id", sa.String(256), nullable=False),
        sa.Column("sync_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "booking_id", "user_id", name="uq_calendar_booking_syncs_booking_user"
        ),
    )
    op.create_index("ix_calendar_booking_syncs_booking_id", "calendar_booking_syncs", ["booking_id"])

    # ── Push Notifications ───────────────────────────────────────────────────

    op.create_table(
        "push_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token", sa.String(256), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False, server_default="ios"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_push_tokens_user_id", "push_tokens", ["user_id"])

    op.create_table(
        "notification_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("booking_id", sa.UUID(), nullable=True),
        sa.Column("notification_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("body", sa.String(512), nullable=False),
        sa.Column("push_token", sa.String(256), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_events_user_id", "notification_events", ["user_id"])
    op.create_index("ix_notification_events_booking_id", "notification_events", ["booking_id"])
    op.create_index(
        "ix_notification_events_scheduled_sent",
        "notification_events",
        ["scheduled_at", "sent_at"],
    )

    # ── Safety ───────────────────────────────────────────────────────────────

    op.create_table(
        "reports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("reporter_id", sa.UUID(), nullable=False),
        sa.Column("reported_id", sa.UUID(), nullable=False),
        sa.Column("reason", sa.String(50), nullable=False),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["reporter_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reported_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reports_reporter_id", "reports", ["reporter_id"])
    op.create_index("ix_reports_reported_id", "reports", ["reported_id"])

    op.create_table(
        "blocks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("blocker_id", sa.UUID(), nullable=False),
        sa.Column("blocked_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["blocker_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocked_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("blocker_id", "blocked_id", name="uq_blocks_blocker_blocked"),
    )
    op.create_index("ix_blocks_blocker_id", "blocks", ["blocker_id"])
    op.create_index("ix_blocks_blocked_id", "blocks", ["blocked_id"])


def downgrade() -> None:
    op.drop_index("ix_blocks_blocked_id", table_name="blocks")
    op.drop_index("ix_blocks_blocker_id", table_name="blocks")
    op.drop_table("blocks")

    op.drop_index("ix_reports_reported_id", table_name="reports")
    op.drop_index("ix_reports_reporter_id", table_name="reports")
    op.drop_table("reports")

    op.drop_index("ix_notification_events_scheduled_sent", table_name="notification_events")
    op.drop_index("ix_notification_events_booking_id", table_name="notification_events")
    op.drop_index("ix_notification_events_user_id", table_name="notification_events")
    op.drop_table("notification_events")

    op.drop_index("ix_push_tokens_user_id", table_name="push_tokens")
    op.drop_table("push_tokens")

    op.drop_index("ix_calendar_booking_syncs_booking_id", table_name="calendar_booking_syncs")
    op.drop_table("calendar_booking_syncs")

    op.drop_index("ix_google_calendar_tokens_user_id", table_name="google_calendar_tokens")
    op.drop_table("google_calendar_tokens")
