"""profile photos table

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_photos",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("profile_id", sa.UUID(), nullable=False),
        sa.Column("photo_url", sa.String(500), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["profile_id"], ["user_profiles.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("profile_id", "position", name="uq_profile_photos_profile_position"),
        sa.CheckConstraint(
            "position >= 0 AND position <= 3",
            name="ck_profile_photos_position_range",
        ),
    )
    op.create_index("ix_profile_photos_profile_id", "profile_photos", ["profile_id"])


def downgrade() -> None:
    op.drop_index("ix_profile_photos_profile_id", table_name="profile_photos")
    op.drop_table("profile_photos")
