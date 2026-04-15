"""add apple_sub to users and make hashed_password nullable

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("apple_sub", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_users_apple_sub", "users", ["apple_sub"], unique=True)
    op.alter_column("users", "hashed_password", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    op.alter_column("users", "hashed_password", existing_type=sa.String(), nullable=False)
    op.drop_index("ix_users_apple_sub", table_name="users")
    op.drop_column("users", "apple_sub")
