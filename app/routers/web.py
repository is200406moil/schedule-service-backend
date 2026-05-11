from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Literal

import base64

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from starlette.status import HTTP_303_SEE_OTHER
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import (
    ACCESS_TOKEN_COOKIE,
    get_current_user_optional,
    get_db,
)
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.repositories import task_repository, user_repository
from app.schemas.task import TaskCreate, TaskUpdate
from app.schemas.user import UserUpdate
from app.services import task_service

router = APIRouter(prefix="/ui", tags=["web"])

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


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
        return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)
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
    return _cookie_response(token, location="/ui/profile")


@router.get("/register")
def register_page(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is not None:
        return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)
    return templates.TemplateResponse(
        request=request,
        name="register.html",
        context={"user": None, "error": request.query_params.get("err")},
    )


@router.get("", include_in_schema=False)
def ui_home(user: User | None = Depends(get_current_user_optional)):
    if user is None:
        return RedirectResponse(url="/ui/login", status_code=HTTP_303_SEE_OTHER)
    return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)


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
    tasks = task_service.list_tasks(db, user)
    return templates.TemplateResponse(
        request=request,
        name="tasks_list.html",
        context={"user": user, "tasks": tasks},
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
        context={"user": user, "task": None, "heading": "Новая задача"},
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
    return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)


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
        return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)
    return templates.TemplateResponse(
        request=request,
        name="task_form.html",
        context={"user": user, "task": task, "heading": "Редактирование"},
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
):
    if user is None:
        return _login_redirect()
    if task_repository.get_for_user(db, task_id, user.id) is None:
        return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)
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
    return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)


@router.post("/tasks/{task_id}/delete")
def task_delete(
    task_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return _login_redirect()
    if task_repository.get_for_user(db, task_id, user.id) is not None:
        task_service.delete_task(db, user, task_id)
    return RedirectResponse(url="/ui/profile", status_code=HTTP_303_SEE_OTHER)
