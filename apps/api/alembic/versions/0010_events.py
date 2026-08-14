"""events + event_participants tables

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-11

V1.1 Battle/Event MVP foundation. Distinct from bookings (1:1) and
tournaments (bracket play). Leaves room for the future report/block
and attendance/no-show streams via the ``status`` field and the
soft-leave audit trail on ``event_participants.status``.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("host_user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("sport", sa.String(30), nullable=False),
        sa.Column("mode", sa.String(20), nullable=False, server_default="casual"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("location_text", sa.String(200), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("visibility", sa.String(20), nullable=False, server_default="public"),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["host_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.CheckConstraint("capacity >= 1", name="ck_events_capacity_min"),
    )
    op.create_index("ix_events_host_user_id", "events", ["host_user_id"])
    op.create_index("ix_events_sport", "events", ["sport"])
    op.create_index("ix_events_starts_at", "events", ["starts_at"])

    op.create_table(
        "event_participants",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="joined"),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "event_id",
            "user_id",
            "status",
            name="uq_event_participants_event_user_status",
        ),
    )
    op.create_index("ix_event_participants_event_id", "event_participants", ["event_id"])
    op.create_index("ix_event_participants_user_id", "event_participants", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_event_participants_user_id", table_name="event_participants")
    op.drop_index("ix_event_participants_event_id", table_name="event_participants")
    op.drop_table("event_participants")

    op.drop_index("ix_events_starts_at", table_name="events")
    op.drop_index("ix_events_sport", table_name="events")
    op.drop_index("ix_events_host_user_id", table_name="events")
    op.drop_table("events")
