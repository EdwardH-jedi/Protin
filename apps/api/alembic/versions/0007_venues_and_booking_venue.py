"""venues table + bookings.venue_id

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-01

Adds the venue catalog used by the Nearby Courts feature and a nullable
foreign key on bookings so a session proposal can reference a venue.

Backwards-compatible: the new column is nullable; existing bookings
continue to use the freeform `location` string.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "venues",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("sport_tags", sa.JSON(), nullable=False),
        sa.Column("area", sa.String(80), nullable=True),
        sa.Column("address", sa.String(300), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("booking_url", sa.String(500), nullable=True),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("is_bookable", sa.Boolean(), nullable=False, server_default=sa.false()),
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
    )

    op.add_column(
        "bookings",
        sa.Column("venue_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_bookings_venue_id",
        "bookings",
        "venues",
        ["venue_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_bookings_venue_id", "bookings", ["venue_id"])


def downgrade() -> None:
    op.drop_index("ix_bookings_venue_id", table_name="bookings")
    op.drop_constraint("fk_bookings_venue_id", "bookings", type_="foreignkey")
    op.drop_column("bookings", "venue_id")
    op.drop_table("venues")
