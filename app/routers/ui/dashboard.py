from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import get_current_user_optional, get_db
from app.models import User
from app.services import task_service
from app.web.forms import login_redirect
from app.web.presentation import dashboard_date, due_label, is_overdue, moscow_today
from app.web.templates import templates

router = APIRouter()


@router.get("", include_in_schema=False)
def ui_home(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    tasks = task_service.list_tasks(db, user)
    active_tasks = [task for task in tasks if task.status != "done"]
    active_tasks.sort(
        key=lambda task: (
            task.due_at is None,
            task.due_at.timestamp() if task.due_at else float("inf"),
        )
    )
    overdue_count = sum(is_overdue(task.due_at) for task in active_tasks)
    today = moscow_today()
    upcoming_tasks = [
        {
            "task": task,
            "due_label": due_label(task.due_at),
            "is_overdue": is_overdue(task.due_at),
            "is_due_today": task.due_at is not None and task.due_at.date() == today,
        }
        for task in active_tasks[:5]
    ]
    return templates.TemplateResponse(
        request=request,
        name="dashboard.html",
        context={
            "user": user,
            "active_count": len(active_tasks),
            "overdue_count": overdue_count,
            "today_label": dashboard_date(today),
            "upcoming_tasks": upcoming_tasks,
        },
    )
