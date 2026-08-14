"""sports_challenges + challenge_result_submissions tables

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-13

Verified-result MVP. Two new tables that back the public ``/challenges``
routes:

  * sports_challenges          — one row per peer-to-peer challenge
  * challenge_result_submissions — one row per participant submission

Rank/Honor mutation still happens exclusively through
:func:`app.services.honor_system.record_match_result_for_honor`. The
challenge service is the only legitimate caller after both
participants submit matching results.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sports_challenges",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("challenger_user_id", sa.UUID(), nullable=False),
        sa.Column("opponent_user_id", sa.UUID(), nullable=False),
        sa.Column("sport", sa.String(30), nullable=False),
        sa.Column("area", sa.String(80), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("note", sa.String(500), nullable=True),
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
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["challenger_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["opponent_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "challenger_user_id <> opponent_user_id",
            name="ck_sports_challenges_distinct_users",
        ),
    )
    op.create_index(
        "ix_sports_challenges_challenger_user_id",
        "sports_challenges",
        ["challenger_user_id"],
    )
    op.create_index(
        "ix_sports_challenges_opponent_user_id",
        "sports_challenges",
        ["opponent_user_id"],
    )
    op.create_index("ix_sports_challenges_sport", "sports_challenges", ["sport"])
    op.create_index("ix_sports_challenges_area", "sports_challenges", ["area"])
    op.create_index("ix_sports_challenges_status", "sports_challenges", ["status"])

    op.create_table(
        "challenge_result_submissions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("challenge_id", sa.UUID(), nullable=False),
        sa.Column("submitted_by_user_id", sa.UUID(), nullable=False),
        sa.Column("winner_user_id", sa.UUID(), nullable=False),
        sa.Column("loser_user_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["challenge_id"], ["sports_challenges.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["winner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["loser_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "challenge_id",
            "submitted_by_user_id",
            name="uq_challenge_submissions_per_user",
        ),
        sa.CheckConstraint(
            "winner_user_id <> loser_user_id",
            name="ck_challenge_submissions_distinct_winner_loser",
        ),
    )
    op.create_index(
        "ix_challenge_result_submissions_challenge_id",
        "challenge_result_submissions",
        ["challenge_id"],
    )
    op.create_index(
        "ix_challenge_result_submissions_submitted_by_user_id",
        "challenge_result_submissions",
        ["submitted_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_challenge_result_submissions_submitted_by_user_id",
        table_name="challenge_result_submissions",
    )
    op.drop_index(
        "ix_challenge_result_submissions_challenge_id",
        table_name="challenge_result_submissions",
    )
    op.drop_table("challenge_result_submissions")

    op.drop_index("ix_sports_challenges_status", table_name="sports_challenges")
    op.drop_index("ix_sports_challenges_area", table_name="sports_challenges")
    op.drop_index("ix_sports_challenges_sport", table_name="sports_challenges")
    op.drop_index("ix_sports_challenges_opponent_user_id", table_name="sports_challenges")
    op.drop_index(
        "ix_sports_challenges_challenger_user_id",
        table_name="sports_challenges",
    )
    op.drop_table("sports_challenges")
