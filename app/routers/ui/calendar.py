from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user_optional, get_db
from app.core.time import datetime_local_value
from app.models import User
from app.services import task_service
from app.web.forms import login_redirect
from app.web.templates import templates

router = APIRouter()


@router.get("/calendar")
def calendar_page(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    tasks = task_service.list_tasks(db, user)
    calendar_tasks = [
        {
            "id": task.id,
            "title": task.title,
            "subject": task.subject,
            "status": task.status,
            "due_at": datetime_local_value(task.due_at) or None,
        }
        for task in tasks
    ]
    return templates.TemplateResponse(
        request=request,
        name="calendar.html",
        context={
            "user": user,
            "calendar_data": {
                "scheduleApi": settings.schedule_api_base_url.rstrip("/"),
                "group": user.group_name or "",
                "tasks": calendar_tasks,
                "initialDate": request.query_params.get("date"),
                "initialLesson": request.query_params.get("lesson"),
            },
        },
    )
