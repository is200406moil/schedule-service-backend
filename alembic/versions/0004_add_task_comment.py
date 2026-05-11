"""add task comment

Revision ID: 0004_add_task_comment
Revises: 0003_remove_task_color_source
Create Date: 2026-04-21

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_add_task_comment"
down_revision: Union[str, None] = "0003_remove_task_color_source"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("comment", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "comment")
