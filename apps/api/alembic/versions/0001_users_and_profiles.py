"""users and profiles

Revision ID: 0001
Revises:
Create Date: 2026-03-18

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "user_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("display_name", sa.String(80), nullable=False),
        sa.Column("bio", sa.String(400), nullable=True),
        sa.Column("birth_year", sa.Integer(), nullable=True),
        sa.Column("suburb", sa.String(80), nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", name="uq_user_profiles_user_id"),
    )

    op.create_table(
        "identity_preferences",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("open_to", sa.JSON(), nullable=False, server_default=sa.text("'[\"any\"]'")),
        sa.Column("age_range_min", sa.Integer(), nullable=False, server_default=sa.text("18")),
        sa.Column("age_range_max", sa.Integer(), nullable=False, server_default=sa.text("65")),
        sa.Column("max_distance_km", sa.Integer(), nullable=False, server_default=sa.text("20")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", name="uq_identity_preferences_user_id"),
    )

    op.create_table(
        "sport_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("sport", sa.String(20), nullable=False),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("preferred_times", sa.JSON(), nullable=False, server_default=sa.text("'[\"flexible\"]'")),
        sa.Column("gym_name", sa.String(120), nullable=True),
        sa.Column("golf_club", sa.String(120), nullable=True),
        sa.Column("goals", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "sport", name="uq_sport_profiles_user_sport"),
    )


def downgrade() -> None:
    op.drop_table("sport_profiles")
    op.drop_table("identity_preferences")
    op.drop_table("user_profiles")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
