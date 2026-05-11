"""attendance columns on event_participants

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-11

V1.1 Attendance/No-show MVP. Adds attendance lifecycle fields to
``event_participants`` while keeping ``status`` (joined/left) as the
participant lifecycle column. Existing rows default to
``attendance_status='pending'`` via server_default so the migration is
backward compatible.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("event_participants") as batch:
        batch.add_column(
            sa.Column(
                "attendance_status",
                sa.String(20),
                nullable=False,
                server_default="pending",
            )
        )
        batch.add_column(
            sa.Column(
                "attendance_confirmed_by_host_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch.add_column(
            sa.Column(
                "attendance_self_reported_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch.add_column(
            sa.Column("attendance_note", sa.String(500), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("event_participants") as batch:
        batch.drop_column("attendance_note")
        batch.drop_column("attendance_self_reported_at")
        batch.drop_column("attendance_confirmed_by_host_at")
        batch.drop_column("attendance_status")
