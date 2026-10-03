"""remove task color and schedule_source

Revision ID: 0003_remove_task_color_source
Revises: 0002_extend_users_tasks
Create Date: 2026-04-20

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_remove_task_color_source"
down_revision: Union[str, None] = "0002_extend_users_tasks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("tasks", "schedule_source")
    op.drop_column("tasks", "color")


def downgrade() -> None:
    op.add_column("tasks", sa.Column("color", sa.String(length=32), nullable=True))
    op.add_column("tasks", sa.Column("schedule_source", sa.String(length=32), nullable=True))