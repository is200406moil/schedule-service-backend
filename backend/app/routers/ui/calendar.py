from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import get_current_user_optional, get_db
from app.core.time import datetime_local_value
from app.models import User
from app.services import task_service
from app.web.forms import login_redirect
from app.web.frontend import preview_assets
from app.web.presentation import moscow_today
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
                "scheduleApi": "/schedule",
                "group": user.group_name or "",
                "tasks": calendar_tasks,
                "initialDate": request.query_params.get("date"),
                "initialLesson": request.query_params.get("lesson"),
            },
        },
    )


@router.get("/calendar/preview", include_in_schema=False)
def calendar_preview(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    return templates.TemplateResponse(
        request=request,
        name="preview.html",
        context={
            "user": user,
            "page_title": "Календарь",
            **preview_assets("src/entries/calendar-main.tsx"),
            "preview_data": {
                "firstName": user.first_name or "",
                "group": user.group_name or "",
                "avatar": user.avatar_base64 or "",
                "today": moscow_today().isoformat(),
                "csrfToken": request.state.csrf_token,
                "initialDate": request.query_params.get("date"),
                "initialLesson": request.query_params.get("lesson"),
            },
        },
    )
