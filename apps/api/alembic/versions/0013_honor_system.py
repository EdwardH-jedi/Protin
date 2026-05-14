"""rank_profiles + honor_titles + honor_history tables

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-13

Honor System MVP — local sports honor titles
(e.g. "Annandale Tennis Champion", "Newtown Badminton Champion") with
an aggregate per-(user, sport, area) rank profile and an append-only
history ledger. All new tables; no existing column changed.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rank_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("sport", sa.String(30), nullable=False),
        sa.Column("area", sa.String(80), nullable=False),
        sa.Column(
            "rating", sa.Integer(), nullable=False, server_default="1000"
        ),
        sa.Column("wins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("losses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "last_played_at", sa.DateTime(timezone=True), nullable=True
        ),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "user_id", "sport", "area", name="uq_rank_profiles_user_sport_area"
        ),
        sa.CheckConstraint("rating >= 0", name="ck_rank_profiles_rating_min"),
        sa.CheckConstraint("wins >= 0", name="ck_rank_profiles_wins_min"),
        sa.CheckConstraint("losses >= 0", name="ck_rank_profiles_losses_min"),
        sa.CheckConstraint("streak >= 0", name="ck_rank_profiles_streak_min"),
    )
    op.create_index("ix_rank_profiles_user_id", "rank_profiles", ["user_id"])
    op.create_index("ix_rank_profiles_sport", "rank_profiles", ["sport"])
    op.create_index("ix_rank_profiles_area", "rank_profiles", ["area"])

    op.create_table(
        "honor_titles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("sport", sa.String(30), nullable=False),
        sa.Column("area", sa.String(80), nullable=False),
        sa.Column("title_name", sa.String(120), nullable=False),
        sa.Column("current_holder_user_id", sa.UUID(), nullable=True),
        sa.Column(
            "active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
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
        sa.ForeignKeyConstraint(
            ["current_holder_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint(
            "sport", "area", "title_name", name="uq_honor_titles_sport_area_name"
        ),
    )
    op.create_index("ix_honor_titles_sport", "honor_titles", ["sport"])
    op.create_index("ix_honor_titles_area", "honor_titles", ["area"])
    op.create_index(
        "ix_honor_titles_current_holder_user_id",
        "honor_titles",
        ["current_holder_user_id"],
    )

    op.create_table(
        "honor_history",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("honor_title_id", sa.UUID(), nullable=False),
        sa.Column("previous_holder_user_id", sa.UUID(), nullable=True),
        sa.Column("new_holder_user_id", sa.UUID(), nullable=False),
        sa.Column("source_match_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["honor_title_id"], ["honor_titles.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["previous_holder_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["new_holder_user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "previous_holder_user_id IS NULL "
            "OR previous_holder_user_id <> new_holder_user_id",
            name="ck_honor_history_distinct_users",
        ),
    )
    op.create_index(
        "ix_honor_history_honor_title_id",
        "honor_history",
        ["honor_title_id"],
    )
    op.create_index(
        "ix_honor_history_previous_holder_user_id",
        "honor_history",
        ["previous_holder_user_id"],
    )
    op.create_index(
        "ix_honor_history_new_holder_user_id",
        "honor_history",
        ["new_holder_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_honor_history_new_holder_user_id", table_name="honor_history"
    )
    op.drop_index(
        "ix_honor_history_previous_holder_user_id", table_name="honor_history"
    )
    op.drop_index(
        "ix_honor_history_honor_title_id", table_name="honor_history"
    )
    op.drop_table("honor_history")

    op.drop_index(
        "ix_honor_titles_current_holder_user_id", table_name="honor_titles"
    )
    op.drop_index("ix_honor_titles_area", table_name="honor_titles")
    op.drop_index("ix_honor_titles_sport", table_name="honor_titles")
    op.drop_table("honor_titles")

    op.drop_index("ix_rank_profiles_area", table_name="rank_profiles")
    op.drop_index("ix_rank_profiles_sport", table_name="rank_profiles")
    op.drop_index("ix_rank_profiles_user_id", table_name="rank_profiles")
    op.drop_table("rank_profiles")
