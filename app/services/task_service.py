from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Task, User
from app.repositories import task_repository
from app.schemas.task import TaskCreate, TaskUpdate


def list_tasks(db: Session, user: User) -> list[Task]:
    return task_repository.list_for_user(db, user.id)


def get_task(db: Session, user: User, task_id: int) -> Task:
    task = task_repository.get_for_user(db, task_id, user.id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def create_task(db: Session, user: User, data: TaskCreate) -> Task:
    return task_repository.create(
        db,
        user_id=user.id,
        title=data.title,
        body=data.body,
        status=data.status,
        due_at=data.due_at,
        subject=data.subject,
    )


def update_task(db: Session, user: User, task_id: int, data: TaskUpdate) -> Task:
    task = get_task(db, user, task_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return task
    return task_repository.update(db, task, updates)


def delete_task(db: Session, user: User, task_id: int) -> None:
    task = get_task(db, user, task_id)
    task_repository.delete(db, task)
