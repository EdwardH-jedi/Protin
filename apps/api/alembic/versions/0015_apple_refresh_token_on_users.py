"""add apple_refresh_token to users (Sign in with Apple revocation)

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-01

Stores the user's Sign in with Apple refresh token (encrypted at rest via the
``EncryptedString`` column type) so account deletion can revoke the user's
Apple tokens, satisfying App Store Guideline 5.1.1(v). Nullable: email/password
users and pre-existing Apple users carry NULL until their next Apple sign-in.
The column holds ciphertext, so it is a plain nullable string at the DB level.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("apple_refresh_token", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "apple_refresh_token")
