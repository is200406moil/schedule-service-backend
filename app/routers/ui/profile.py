from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from starlette.status import HTTP_303_SEE_OTHER

from app.core.avatar import AvatarValidationError
from app.core.config import settings
from app.core.csrf import validate_csrf_token
from app.core.deps import get_current_user_optional, get_db
from app.models import User
from app.services import task_service, user_service
from app.web.forms import encode_avatar_file, login_redirect
from app.web.presentation import due_label, is_overdue
from app.web.templates import templates

router = APIRouter()


@router.get("/profile")
def profile_page(
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
    profile_tasks = [
        {
            "task": task,
            "due_label": due_label(task.due_at),
            "is_overdue": is_overdue(task.due_at),
        }
        for task in active_tasks[:3]
    ]
    return templates.TemplateResponse(
        request=request,
        name="profile.html",
        context={
            "user": user,
            "active_count": len(active_tasks),
            "completed_count": sum(task.status == "done" for task in tasks),
            "profile_tasks": profile_tasks,
            "error": request.query_params.get("err"),
        },
    )


@router.post("/profile")
def profile_submit(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
    first_name: str | None = Form(None),
    last_name: str | None = Form(None),
    patronymic: str | None = Form(None),
    birth_date: str | None = Form(None),
    group_name: str | None = Form(None),
    avatar_file: UploadFile | None = File(None),
    csrf_token: str | None = Form(None),
):
    validate_csrf_token(request, csrf_token, settings.secret_key)
    if user is None:
        return login_redirect()
    updates: dict[str, object] = {}
    if first_name is not None and first_name.strip() != "":
        updates["first_name"] = first_name.strip()
    if last_name is not None and last_name.strip() != "":
        updates["last_name"] = last_name.strip()
    if patronymic is not None and patronymic.strip() != "":
        updates["patronymic"] = patronymic.strip()
    if birth_date:
        updates["birth_date"] = datetime.fromisoformat(birth_date).date()
    if group_name is not None and group_name.strip() != "":
        updates["group_name"] = group_name.strip()
    try:
        avatar_base64 = encode_avatar_file(avatar_file)
    except AvatarValidationError:
        return RedirectResponse(
            url="/ui/profile?err=avatar",
            status_code=HTTP_303_SEE_OTHER,
        )
    if avatar_base64 is not None:
        updates["avatar_base64"] = avatar_base64
    user_service.update_user(db, user, updates)
    return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)
