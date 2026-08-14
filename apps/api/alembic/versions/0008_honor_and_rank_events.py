"""honor_events + rank_events tables

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-01

Append-only ledgers feeding the V2 Sports Reputation feature:
- honor_events: per-user reliability deltas with a small reason vocabulary
- rank_events:  per-(user, sport) competitive points

Backwards-compatible: all new tables, no existing column changed. Bookings
continue to work exactly as before until the rank service is wired into
their FSM hook (this migration creates the schema only; behaviour change
is in code).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "honor_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("booking_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_honor_events_user_id", "honor_events", ["user_id"])
    op.create_index("ix_honor_events_booking_id", "honor_events", ["booking_id"])

    op.create_table(
        "rank_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("sport", sa.String(20), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("booking_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_rank_events_user_id", "rank_events", ["user_id"])
    op.create_index("ix_rank_events_sport", "rank_events", ["sport"])
    op.create_index("ix_rank_events_booking_id", "rank_events", ["booking_id"])


def downgrade() -> None:
    op.drop_index("ix_rank_events_booking_id", table_name="rank_events")
    op.drop_index("ix_rank_events_sport", table_name="rank_events")
    op.drop_index("ix_rank_events_user_id", table_name="rank_events")
    op.drop_table("rank_events")

    op.drop_index("ix_honor_events_booking_id", table_name="honor_events")
    op.drop_index("ix_honor_events_user_id", table_name="honor_events")
    op.drop_table("honor_events")
