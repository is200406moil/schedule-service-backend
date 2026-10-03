"""extend users and tasks

Revision ID: 0002_extend_users_tasks
Revises: 0001_initial
Create Date: 2026-04-19

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_extend_users_tasks"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("first_name", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("patronymic", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("group_name", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("avatar_base64", sa.Text(), nullable=True))

    op.add_column("tasks", sa.Column("subject", sa.String(length=255), nullable=True))
    op.add_column("tasks", sa.Column("color", sa.String(length=32), nullable=True))
    op.add_column("tasks", sa.Column("schedule_source", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "schedule_source")
    op.drop_column("tasks", "color")
    op.drop_column("tasks", "subject")
    op.drop_column("users", "avatar_base64")
    op.drop_column("users", "group_name")
    op.drop_column("users", "birth_date")
    op.drop_column("users", "patronymic")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")