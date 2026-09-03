from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from starlette.status import HTTP_303_SEE_OTHER

from app.core.avatar import MAX_AVATAR_BYTES, AvatarValidationError, encode_avatar
from app.core.config import settings
from app.core.csrf import validate_csrf_token
from app.core.deps import (
    ACCESS_TOKEN_COOKIE,
    get_current_user_optional,
    get_db,
)
from app.core.rate_limit import login_rate_limit_key, login_rate_limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.repositories import task_repository, user_repository
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import task_service
from app.web.presentation import (
    dashboard_date,
    due_label,
    is_overdue,
    moscow_today,
    task_sections,
)

router = APIRouter(prefix="/ui", tags=["web"])

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
templates.env.globals.update(
    schedule_api_base_url=settings.schedule_api_base_url.rstrip("/"),
    schedule_api_docs_url=settings.schedule_api_docs_url,
)


def _login_redirect() -> RedirectResponse:
    return RedirectResponse(url="/ui/login", status_code=HTTP_303_SEE_OTHER)


def _cookie_response(token: str, *, location: str) -> RedirectResponse:
    resp = RedirectResponse(url=location, status_code=HTTP_303_SEE_OTHER)
    max_age = settings.access_token_expire_minutes * 60
    resp.set_cookie(
        ACCESS_TOKEN_COOKIE,
        token,
        httponly=True,
        max_age=max_age,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return resp


def _clear_auth_cookie(resp: RedirectResponse) -> RedirectResponse:
    resp.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    return resp


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _parse_due_at(raw: str | None) -> datetime | None:
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    return datetime.fromisoformat(s)


def _safe_ui_return(value: str | None, default: str = "/ui/tasks") -> str:
    if value and value.startswith("/ui") and not value.startswith("//"):
        return value
    return default


def _encode_avatar_file(file: UploadFile | None) -> str | None:
    if file is None or not file.filename:
        return None
    raw = file.file.read(MAX_AVATAR_BYTES + 1)
    if not raw:
        return None
    return encode_avatar(file.content_type, raw)


@router.get("/login")
def login_page(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is not None:
        return RedirectResponse(url="/ui", status_code=HTTP_303_SEE_OTHER)
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={
            "user": None,
            "error": request.query_params.get("err"),
            "ok": request.query_params.get("ok"),
        },
    )


@router.post("/login")
def login_submit(
    request: Request,
    db: Session = Depends(get_db),
    email: str = Form(...),
    password: str = Form(...),
    csrf_token: str | None = Form(None),
):
    validate_csrf_token(request, csrf_token, settings.secret_key)
    e = _normalize_email(email)
    rate_limit_key = login_rate_limit_key(request, e)
    if login_rate_limiter.retry_after(rate_limit_key) is not None:
        return RedirectResponse(
            url="/ui/login?err=rate",
            status_code=HTTP_303_SEE_OTHER,
        )
    u = user_repository.get_by_email(db, e)
    if u is None or not verify_password(password, u.password_hash):
        retry_after = login_rate_limiter.record_failure(rate_limit_key)
        return RedirectResponse(
            url=f"/ui/login?err={'rate' if retry_after is not None else 'auth'}",
            status_code=HTTP_303_SEE_OTHER,
        )
    if not u.is_active:
        return RedirectResponse(
            url="/ui/login?err=inactive",
            status_code=HTTP_303_SEE_OTHER,
        )
    login_rate_limiter.reset(rate_limit_key)
    token = create_access_token(
        subject=str(u.id),
        secret_key=settings.secret_key,
        expires_minutes=settings.access_token_expire_minutes,
    )
    return _cookie_response(token, location="/ui")


@router.get("/register")
def register_page(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is not None:
        return RedirectResponse(url="/ui", status_code=HTTP_303_SEE_OTHER)
    return templates.TemplateResponse(
        request=request,
        name="register.html",
        context={"user": None, "error": request.query_params.get("err")},
    )


@router.get("", include_in_schema=False)
def ui_home(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return RedirectResponse(url="/ui/login", status_code=HTTP_303_SEE_OTHER)
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
            "is_due_today": task.due_at is not None
            and task.due_at.date() == today,
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


@router.post("/register")
def register_submit(
    request: Request,
    db: Session = Depends(get_db),
    email: str = Form(...),
    password: str = Form(...),
    first_name: str | None = Form(None),
    last_name: str | None = Form(None),
    patronymic: str | None = Form(None),
    birth_date: str | None = Form(None),
    group_name: str | None = Form(None),
    avatar_file: UploadFile | None = File(None),
    csrf_token: str | None = Form(None),
):
    validate_csrf_token(request, csrf_token, settings.secret_key)
    e = _normalize_email(email)
    if len(password) < 8:
        return RedirectResponse(
            url="/ui/register?err=short",
            status_code=HTTP_303_SEE_OTHER,
        )
    if user_repository.get_by_email(db, e):
        return RedirectResponse(
            url="/ui/register?err=exists",
            status_code=HTTP_303_SEE_OTHER,
        )
    try:
        avatar_base64 = _encode_avatar_file(avatar_file)
    except AvatarValidationError:
        return RedirectResponse(
            url="/ui/register?err=avatar",
            status_code=HTTP_303_SEE_OTHER,
        )
    user_repository.create(
        db,
        email=e,
        password_hash=hash_password(password),
        first_name=first_name.strip() if first_name else None,
        last_name=last_name.strip() if last_name else None,
        patronymic=patronymic.strip() if patronymic else None,
        birth_date=datetime.fromisoformat(birth_date).date() if birth_date else None,
        group_name=group_name.strip() if group_name else None,
        avatar_base64=avatar_base64,
    )
    return RedirectResponse(
        url="/ui/login?ok=registered",
        status_code=HTTP_303_SEE_OTHER,
    )


@router.post("/logout")
def logout(request: Request, csrf_token: str | None = Form(None)):
    validate_csrf_token(request, csrf_token, settings.secret_key)
    resp = RedirectResponse(url="/ui/login", status_code=HTTP_303_SEE_OTHER)
    return _clear_auth_cookie(resp)


@router.get("/tasks")
def tasks_list(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return _login_redirect()
    all_tasks = task_service.list_tasks(db, user)
    today = moscow_today()
    counts = {
        "all": len(all_tasks),
        "active": sum(task.status != "done" for task in all_tasks),
        "today": sum(
            task.status != "done"
            and task.due_at is not None
            and task.due_at.date() == today
            for task in all_tasks
        ),
        "overdue": sum(
            task.status != "done" and is_overdue(task.due_at)
            for task in all_tasks
        ),
        "done": sum(task.status == "done" for task in all_tasks),
    }
    task_filter = request.query_params.get("filter", "all")
    if task_filter not in counts:
        task_filter = "all"
    if task_filter == "active":
        tasks = [task for task in all_tasks if task.status != "done"]
    elif task_filter == "today":
        tasks = [
            task
            for task in all_tasks
            if task.status != "done"
            and task.due_at is not None
            and task.due_at.date() == today
        ]
    elif task_filter == "overdue":
        tasks = [
            task
            for task in all_tasks
            if task.status != "done" and is_overdue(task.due_at)
        ]
    elif task_filter == "done":
        tasks = [task for task in all_tasks if task.status == "done"]
    else:
        tasks = all_tasks
    return templates.TemplateResponse(
        request=request,
        name="tasks_list.html",
        context={
            "user": user,
            "task_sections": task_sections(tasks, today),
            "task_filter": task_filter,
            "task_counts": counts,
        },
    )


@router.get("/calendar")
def calendar_page(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return _login_redirect()
    tasks = task_service.list_tasks(db, user)
    calendar_tasks = [
        {
            "id": task.id,
            "title": task.title,
            "subject": task.subject,
            "status": task.status,
            "due_at": task.due_at.strftime("%Y-%m-%dT%H:%M")
            if task.due_at
            else None,
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


@router.get("/profile")
def profile_page(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return _login_redirect()
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
        return _login_redirect()
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
        avatar_base64 = _encode_avatar_file(avatar_file)
    except AvatarValidationError:
        return RedirectResponse(
            url="/ui/profile?err=avatar",
            status_code=HTTP_303_SEE_OTHER,
        )
    if avatar_base64 is not None:
        updates["avatar_base64"] = avatar_base64
    if updates:
        user_repository.update(db, user, updates)
    return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)


@router.get("/tasks/new")
def task_new_form(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return _login_redirect()
    return templates.TemplateResponse(
        request=request,
        name="task_form.html",
        context={
            "user": user,
            "task": None,
            "heading": "Новая задача",
            "return_to": _safe_ui_return(request.query_params.get("return_to")),
        },
    )


@router.post("/tasks/new")
def task_new_submit(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
    title: str = Form(...),
    body: str | None = Form(None),
    status_done: str | None = Form(None),
    due_at: str | None = Form(None),
    subject: str | None = Form(None),
    return_to: str | None = Form(None),
    csrf_token: str | None = Form(None),
):
    validate_csrf_token(request, csrf_token, settings.secret_key)
    if user is None:
        return _login_redirect()
    body_clean = None if body is None or body.strip() == "" else body.strip()
    due = _parse_due_at(due_at)
    st = "done" if status_done else "todo"
    data = TaskCreate(
        title=title.strip(),
        body=body_clean,
        status=st,
        due_at=due,
        subject=subject.strip() if subject else None,
    )
    task_service.create_task(db, user, data)
    return RedirectResponse(
        url=_safe_ui_return(return_to),
        status_code=HTTP_303_SEE_OTHER,
    )


@router.get("/tasks/{task_id}/edit")
def task_edit_form(
    request: Request,
    task_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return _login_redirect()
    task = task_repository.get_for_user(db, task_id, user.id)
    if task is None:
        return RedirectResponse(url="/ui/tasks", status_code=HTTP_303_SEE_OTHER)
    return templates.TemplateResponse(
        request=request,
        name="task_form.html",
        context={
            "user": user,
            "task": task,
            "heading": "Редактировать задачу",
            "return_to": _safe_ui_return(request.query_params.get("return_to")),
        },
    )


@router.post("/tasks/{task_id}/edit")
def task_edit_submit(
    request: Request,
    task_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
    title: str = Form(...),
    body: str | None = Form(None),
    status_done: str | None = Form(None),
    due_at: str | None = Form(None),
    clear_due_at: str | None = Form(None),
    subject: str | None = Form(None),
    return_to: str | None = Form(None),
    csrf_token: str | None = Form(None),
):
    validate_csrf_token(request, csrf_token, settings.secret_key)
    if user is None:
        return _login_redirect()
    if task_repository.get_for_user(db, task_id, user.id) is None:
        return RedirectResponse(url="/ui/tasks", status_code=HTTP_303_SEE_OTHER)
    body_clean = None if body is None or body.strip() == "" else body.strip()
    if clear_due_at:
        due: datetime | None = None
    else:
        due = _parse_due_at(due_at)
    st = "done" if status_done else "todo"
    data = TaskUpdate(
        title=title.strip(),
        body=body_clean,
        status=st,
        due_at=due,
        subject=subject.strip() if subject else None,
    )
    task_service.update_task(db, user, task_id, data)
    return RedirectResponse(
        url=_safe_ui_return(return_to),
        status_code=HTTP_303_SEE_OTHER,
    )


@router.post("/tasks/{task_id}/delete")
def task_delete(
    request: Request,
    task_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
    return_to: str | None = Form(None),
    csrf_token: str | None = Form(None),
):
    validate_csrf_token(request, csrf_token, settings.secret_key)
    if user is None:
        return _login_redirect()
    if task_repository.get_for_user(db, task_id, user.id) is not None:
        task_service.delete_task(db, user, task_id)
    return RedirectResponse(
        url=_safe_ui_return(return_to),
        status_code=HTTP_303_SEE_OTHER,
    )
