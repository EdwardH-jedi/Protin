"""tournaments + tournament_participants tables

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-01

V2 Phase 3 — Tournament MVP. Two new tables, no existing column touched.

KNOWN ARCHITECTURAL DEBT: this lives alongside the booking FSM rather
than subsuming it (events table). The duplicated state machine is the
deliberate trade-off documented in the V2 plan. Schedule a follow-up
to reconcile bookings + tournaments into a single events model once
the V2 surface is otherwise stable.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tournaments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organizer_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("sport", sa.String(20), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("area", sa.String(80), nullable=True),
        sa.Column("venue_id", sa.UUID(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
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
        sa.ForeignKeyConstraint(["organizer_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["venue_id"], ["venues.id"], ondelete="SET NULL"),
        sa.CheckConstraint("capacity >= 2", name="ck_tournaments_capacity_min"),
    )
    op.create_index("ix_tournaments_organizer_id", "tournaments", ["organizer_id"])
    op.create_index("ix_tournaments_sport", "tournaments", ["sport"])
    op.create_index("ix_tournaments_venue_id", "tournaments", ["venue_id"])
    op.create_index("ix_tournaments_starts_at", "tournaments", ["starts_at"])

    op.create_table(
        "tournament_participants",
        sa.Column("tournament_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("tournament_id", "user_id"),
        sa.ForeignKeyConstraint(["tournament_id"], ["tournaments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("tournament_participants")

    op.drop_index("ix_tournaments_starts_at", table_name="tournaments")
    op.drop_index("ix_tournaments_venue_id", table_name="tournaments")
    op.drop_index("ix_tournaments_sport", table_name="tournaments")
    op.drop_index("ix_tournaments_organizer_id", table_name="tournaments")
    op.drop_table("tournaments")
