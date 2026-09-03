from __future__ import annotations

import base64
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from starlette.status import HTTP_303_SEE_OTHER

from app.core.config import settings
from app.core.deps import (
    ACCESS_TOKEN_COOKIE,
    get_current_user_optional,
    get_db,
)
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Task, User
from app.repositories import task_repository, user_repository
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import task_service

router = APIRouter(prefix="/ui", tags=["web"])
MOSCOW_TIMEZONE = timezone(timedelta(hours=3))

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


def _task_status(value: str) -> Literal["todo", "done"]:
    return "done" if value == "done" else "todo"


def _is_overdue(due_at: datetime | None) -> bool:
    if due_at is None:
        return False
    due_wall_time = due_at.replace(tzinfo=None)
    moscow_wall_time = datetime.now(MOSCOW_TIMEZONE).replace(tzinfo=None)
    return due_wall_time < moscow_wall_time


def _moscow_today() -> date:
    return datetime.now(MOSCOW_TIMEZONE).date()


def _due_label(due_at: datetime | None) -> str:
    if due_at is None:
        return "Без срока"
    today = _moscow_today()
    if due_at.date() == today:
        return f"Сегодня · {due_at:%H:%M}"
    if due_at.date() == today + timedelta(days=1):
        return f"Завтра · {due_at:%H:%M}"
    months = (
        "января",
        "февраля",
        "марта",
        "апреля",
        "мая",
        "июня",
        "июля",
        "августа",
        "сентября",
        "октября",
        "ноября",
        "декабря",
    )
    return f"{due_at.day} {months[due_at.month - 1]} · {due_at:%H:%M}"


def _task_section_key(task: Task, today: date) -> str:
    if task.status == "done":
        return "done"
    if task.due_at is None:
        return "no_due"
    if task.due_at.date() < today:
        return "overdue"
    if task.due_at.date() == today:
        return "today"
    return "upcoming"


def _task_sections(tasks: list[Task], today: date) -> list[dict[str, object]]:
    section_meta = (
        ("overdue", "Просрочено", "Срок уже прошёл"),
        ("today", "Сегодня", "На ближайшие часы"),
        ("upcoming", "Ближайшие", "Запланировано дальше"),
        ("no_due", "Без срока", "Можно сделать в свободное время"),
        ("done", "Выполнено", "Готовые задачи"),
    )
    grouped: dict[str, list[Task]] = {key: [] for key, _, _ in section_meta}
    for task in tasks:
        key = _task_section_key(task, today)
        grouped[key].append(task)

    for key in ("overdue", "today", "upcoming"):
        grouped[key].sort(key=lambda task: task.due_at.timestamp() if task.due_at else 0)
    grouped["no_due"].sort(
        key=lambda task: task.created_at.timestamp(),
        reverse=True,
    )
    grouped["done"].sort(
        key=lambda task: task.updated_at.timestamp(),
        reverse=True,
    )
    return [
        {
            "key": key,
            "title": title,
            "subtitle": subtitle,
            "items": [
                {
                    "task": task,
                    "due_label": _due_label(task.due_at),
                    "is_overdue": key == "overdue",
                    "is_done": task.status == "done",
                }
                for task in grouped[key]
            ],
        }
        for key, title, subtitle in section_meta
        if grouped[key]
    ]


def _safe_ui_return(value: str | None, default: str = "/ui/tasks") -> str:
    if value and value.startswith("/ui") and not value.startswith("//"):
        return value
    return default


def _dashboard_date(value: date) -> str:
    weekdays = (
        "Понедельник",
        "Вторник",
        "Среда",
        "Четверг",
        "Пятница",
        "Суббота",
        "Воскресенье",
    )
    months = (
        "января",
        "февраля",
        "марта",
        "апреля",
        "мая",
        "июня",
        "июля",
        "августа",
        "сентября",
        "октября",
        "ноября",
        "декабря",
    )
    return f"{weekdays[value.weekday()]}, {value.day} {months[value.month - 1]}"


def _encode_avatar_file(file: UploadFile | None) -> str | None:
    if file is None or not file.filename:
        return None
    raw = file.file.read()
    if not raw:
        return None
    content_type = file.content_type or "application/octet-stream"
    b64 = base64.b64encode(raw).decode("utf-8")
    return f"data:{content_type};base64,{b64}"


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
    db: Session = Depends(get_db),
    email: str = Form(...),
    password: str = Form(...),
):
    e = _normalize_email(email)
    u = user_repository.get_by_email(db, e)
    if u is None or not verify_password(password, u.password_hash):
        return RedirectResponse(
            url="/ui/login?err=auth",
            status_code=HTTP_303_SEE_OTHER,
        )
    if not u.is_active:
        return RedirectResponse(
            url="/ui/login?err=inactive",
            status_code=HTTP_303_SEE_OTHER,
        )
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
    overdue_count = sum(_is_overdue(task.due_at) for task in active_tasks)
    today = _moscow_today()
    upcoming_tasks = [
        {
            "task": task,
            "due_label": _due_label(task.due_at),
            "is_overdue": _is_overdue(task.due_at),
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
            "today_label": _dashboard_date(today),
            "upcoming_tasks": upcoming_tasks,
        },
    )


@router.post("/register")
def register_submit(
    db: Session = Depends(get_db),
    email: str = Form(...),
    password: str = Form(...),
    first_name: str | None = Form(None),
    last_name: str | None = Form(None),
    patronymic: str | None = Form(None),
    birth_date: str | None = Form(None),
    group_name: str | None = Form(None),
    avatar_file: UploadFile | None = File(None),
):
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
    avatar_base64 = _encode_avatar_file(avatar_file)
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
def logout():
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
    today = _moscow_today()
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
            task.status != "done" and _is_overdue(task.due_at)
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
            if task.status != "done" and _is_overdue(task.due_at)
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
            "task_sections": _task_sections(tasks, today),
            "task_filter": task_filter,
            "task_counts": counts,
        },
    )


@router.get("/calendar")
def calendar_page(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return _login_redirect()
    return templates.TemplateResponse(
        request=request,
        name="calendar.html",
        context={"user": user},
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
    return templates.TemplateResponse(
        request=request,
        name="profile.html",
        context={"user": user, "tasks": tasks},
    )


@router.post("/profile")
def profile_submit(
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
    first_name: str | None = Form(None),
    last_name: str | None = Form(None),
    patronymic: str | None = Form(None),
    birth_date: str | None = Form(None),
    group_name: str | None = Form(None),
    avatar_file: UploadFile | None = File(None),
):
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
    avatar_base64 = _encode_avatar_file(avatar_file)
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
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
    title: str = Form(...),
    body: str | None = Form(None),
    status_done: str | None = Form(None),
    due_at: str | None = Form(None),
    subject: str | None = Form(None),
    return_to: str | None = Form(None),
):
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
):
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
    task_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
    return_to: str | None = Form(None),
):
    if user is None:
        return _login_redirect()
    if task_repository.get_for_user(db, task_id, user.id) is not None:
        task_service.delete_task(db, user, task_id)
    return RedirectResponse(
        url=_safe_ui_return(return_to),
        status_code=HTTP_303_SEE_OTHER,
    )
