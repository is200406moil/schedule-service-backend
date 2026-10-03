"""Remove the obsolete task comment column.

Revision ID: b41386e20c13
Revises: 0004_add_task_comment
Create Date: 2026-05-11 21:31:43.784839
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b41386e20c13"
down_revision: Union[str, None] = "0004_add_task_comment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("tasks", "comment")


def downgrade() -> None:
    op.add_column("tasks", sa.Column("comment", sa.Text(), nullable=True))
