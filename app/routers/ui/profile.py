from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status
from fastapi.responses import RedirectResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.status import HTTP_303_SEE_OTHER

from app.core.avatar import AvatarValidationError
from app.core.config import settings
from app.core.csrf import validate_csrf_token
from app.core.deps import get_current_user_optional, get_db
from app.core.time import as_utc
from app.models import User
from app.schemas.user import UserUpdate
from app.services import task_service, user_service
from app.web.forms import encode_avatar_file, login_redirect
from app.web.presentation import due_label, is_overdue
from app.web.templates import templates

router = APIRouter()


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _profile_context(
    db: Session,
    user: User,
    *,
    error: str | None = None,
    form_values: dict[str, str] | None = None,
    open_edit: bool = False,
) -> dict[str, object]:
    tasks = task_service.list_tasks(db, user)
    active_tasks = [task for task in tasks if task.status != "done"]
    active_tasks.sort(
        key=lambda task: (
            task.due_at is None,
            as_utc(task.due_at).timestamp() if task.due_at else float("inf"),
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
    return {
        "user": user,
        "active_count": len(active_tasks),
        "completed_count": sum(task.status == "done" for task in tasks),
        "profile_tasks": profile_tasks,
        "error": error,
        "form_values": form_values
        or {
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
            "patronymic": user.patronymic or "",
            "birth_date": user.birth_date.isoformat() if user.birth_date else "",
            "group_name": user.group_name or "",
        },
        "open_edit": open_edit,
    }


def _profile_response(
    request: Request,
    db: Session,
    user: User,
    *,
    error: str | None = None,
    form_values: dict[str, str] | None = None,
    open_edit: bool = False,
    status_code: int = status.HTTP_200_OK,
):
    return templates.TemplateResponse(
        request=request,
        name="profile.html",
        context=_profile_context(
            db,
            user,
            error=error,
            form_values=form_values,
            open_edit=open_edit,
        ),
        status_code=status_code,
    )


@router.get("/profile")
def profile_page(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    return _profile_response(
        request,
        db,
        user,
        error=request.query_params.get("err"),
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
    form_kind: str = Form("details"),
    csrf_token: str | None = Form(None),
):
    validate_csrf_token(request, csrf_token, settings.secret_key)
    if user is None:
        return login_redirect()
    if form_kind == "details":
        form_values = {
            "first_name": first_name or "",
            "last_name": last_name or "",
            "patronymic": patronymic or "",
            "birth_date": birth_date or "",
            "group_name": group_name or "",
        }
        try:
            data = UserUpdate(
                first_name=_clean_optional(first_name),
                last_name=_clean_optional(last_name),
                patronymic=_clean_optional(patronymic),
                birth_date=birth_date or None,
                group_name=_clean_optional(group_name),
            )
        except ValidationError:
            return _profile_response(
                request,
                db,
                user,
                error="invalid",
                form_values=form_values,
                open_edit=True,
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        updates: dict[str, object] = data.model_dump()
    else:
        updates = {}
    try:
        avatar_base64 = encode_avatar_file(avatar_file)
    except AvatarValidationError:
        return _profile_response(
            request,
            db,
            user,
            error="avatar",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    if avatar_base64 is not None:
        updates["avatar_base64"] = avatar_base64
    user_service.update_user(db, user, updates)
    return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)
