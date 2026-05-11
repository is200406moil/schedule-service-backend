from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Task


def list_for_user(db: Session, user_id: int) -> list[Task]:
    stmt = select(Task).where(Task.user_id == user_id).order_by(Task.created_at.desc())
    return list(db.scalars(stmt))


def get_for_user(db: Session, task_id: int, user_id: int) -> Task | None:
    return db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user_id))


def create(
    db: Session,
    *,
    user_id: int,
    title: str,
    body: str | None,
    status: str,
    due_at: datetime | None,
    subject: str | None = None,
) -> Task:
    task = Task(
        user_id=user_id,
        title=title,
        body=body,
        status=status,
        due_at=due_at,
        subject=subject,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update(db: Session, task: Task, data: dict) -> Task:
    for key, value in data.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task


def delete(db: Session, task: Task) -> None:
    db.delete(task)
    db.commit()
