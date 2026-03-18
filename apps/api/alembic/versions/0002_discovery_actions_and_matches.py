"""discovery actions and matches

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "discovery_actions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("sport", sa.String(20), nullable=False),
        sa.Column("action", sa.String(10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "actor_id", "target_id", "sport",
            name="uq_discovery_actions_actor_target_sport",
        ),
    )
    op.create_index("ix_discovery_actions_actor_id", "discovery_actions", ["actor_id"])
    op.create_index("ix_discovery_actions_target_id", "discovery_actions", ["target_id"])

    op.create_table(
        "matches",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user1_id", sa.UUID(), nullable=False),
        sa.Column("user2_id", sa.UUID(), nullable=False),
        sa.Column("sport", sa.String(20), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user1_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user2_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "user1_id", "user2_id", "sport",
            name="uq_matches_canonical_pair_sport",
        ),
    )
    op.create_index("ix_matches_user1_id", "matches", ["user1_id"])
    op.create_index("ix_matches_user2_id", "matches", ["user2_id"])


def downgrade() -> None:
    op.drop_index("ix_matches_user2_id", table_name="matches")
    op.drop_index("ix_matches_user1_id", table_name="matches")
    op.drop_table("matches")
    op.drop_index("ix_discovery_actions_target_id", table_name="discovery_actions")
    op.drop_index("ix_discovery_actions_actor_id", table_name="discovery_actions")
    op.drop_table("discovery_actions")
