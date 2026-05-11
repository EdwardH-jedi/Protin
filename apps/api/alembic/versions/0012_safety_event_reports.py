"""extend reports with target_type / target_event_id / status / updated_at

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-12

V1.1 Report / Block / Safety contract realignment. Extends the existing
``reports`` table to support event-target reports and a moderation
status field used by the Honor calculation. Backward compatible:
  * existing rows default to target_type='user' and status='submitted'
  * reported_id is relaxed to nullable so event-only reports can omit
    a user target
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("reports") as batch:
        batch.add_column(
            sa.Column(
                "target_type",
                sa.String(20),
                nullable=False,
                server_default="user",
            )
        )
        batch.add_column(
            sa.Column(
                "target_event_id",
                sa.UUID(),
                nullable=True,
            )
        )
        batch.add_column(
            sa.Column(
                "status",
                sa.String(20),
                nullable=False,
                server_default="submitted",
            )
        )
        batch.add_column(
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            )
        )
        # Event-only reports may omit reported_id; relax the column.
        batch.alter_column("reported_id", existing_type=sa.UUID(), nullable=True)
        batch.create_foreign_key(
            "fk_reports_target_event_id_events",
            "events",
            ["target_event_id"],
            ["id"],
            ondelete="CASCADE",
        )
    op.create_index(
        "ix_reports_target_event_id", "reports", ["target_event_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_reports_target_event_id", table_name="reports")
    with op.batch_alter_table("reports") as batch:
        batch.drop_constraint(
            "fk_reports_target_event_id_events", type_="foreignkey"
        )
        batch.alter_column("reported_id", existing_type=sa.UUID(), nullable=False)
        batch.drop_column("updated_at")
        batch.drop_column("status")
        batch.drop_column("target_event_id")
        batch.drop_column("target_type")
