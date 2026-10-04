from datetime import datetime

from fastapi import APIRouter, Depends, Form, Request, status
from fastapi.responses import RedirectResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.status import HTTP_303_SEE_OTHER

from app.core.config import settings
from app.core.csrf import validate_csrf_token
from app.core.deps import get_current_user_optional, get_db
from app.core.time import datetime_local_value
from app.models import Task, User
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import task_service
from app.web.forms import canonical_ui_redirect, login_redirect, parse_due_at, safe_ui_return
from app.web.frontend import react_assets
from app.web.presentation import moscow_today
from app.web.templates import templates

router = APIRouter()


@router.get("/tasks")
def tasks_list(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    return templates.TemplateResponse(
        request=request,
        name="react.html",
        context={
            "user": user,
            "page_title": "Задачи",
            **react_assets("src/entries/tasks-main.tsx"),
            "page_data": {
                "firstName": user.first_name or "",
                "group": user.group_name or "",
                "avatar": user.avatar_base64 or "",
                "today": moscow_today().isoformat(),
                "csrfToken": request.state.csrf_token,
                "initialFilter": request.query_params.get("filter"),
            },
        },
    )


@router.get("/tasks/preview", include_in_schema=False)
def tasks_preview_redirect(request: Request):
    return canonical_ui_redirect(request, "/ui/tasks")


def _task_editor_response(request: Request, user: User, *, task_id: int | None, page_title: str):
    subject = request.query_params.get("subject")
    return_to = safe_ui_return(request.query_params.get("return_to"))
    return templates.TemplateResponse(
        request=request,
        name="react.html",
        context={
            "user": user,
            "page_title": page_title,
            **react_assets("src/entries/task-editor-main.tsx"),
            "page_data": {
                "firstName": user.first_name or "",
                "group": user.group_name or "",
                "avatar": user.avatar_base64 or "",
                "today": moscow_today().isoformat(),
                "csrfToken": request.state.csrf_token,
                "taskId": task_id,
                "returnTo": return_to,
                "initialSubject": subject[:255] if subject is not None else None,
            },
        },
    )


def _task_form_values(task: Task | None = None) -> dict[str, str | bool]:
    return {
        "title": task.title if task else "",
        "body": (task.body or "") if task else "",
        "due_at": datetime_local_value(task.due_at) if task else "",
        "subject": (task.subject or "") if task else "",
        "status_done": bool(task and task.status == "done"),
    }


def _clean_optional(value: str | None) -> str | None:
    cleaned = value.strip() if value else ""
    return cleaned or None


def _task_form_response(
    request: Request,
    user: User,
    *,
    task: Task | None,
    heading: str,
    return_to: str,
    form_values: dict[str, str | bool] | None = None,
    error: str | None = None,
    status_code: int = status.HTTP_200_OK,
):
    """Compatibility response for validation errors from legacy form submissions."""
    return templates.TemplateResponse(
        request=request,
        name="task_form.html",
        context={
            "user": user,
            "task": task,
            "heading": heading,
            "return_to": return_to,
            "form_values": form_values or _task_form_values(task),
            "error": error,
        },
        status_code=status_code,
    )


@router.get("/tasks/new")
def task_new_page(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    return _task_editor_response(request, user, task_id=None, page_title="Новая задача")


@router.get("/tasks/new/preview", include_in_schema=False)
def task_new_preview_redirect(request: Request):
    return canonical_ui_redirect(request, "/ui/tasks/new")


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
    """Compatibility-only form endpoint; the React editor uses the tasks API."""
    validate_csrf_token(request, csrf_token, settings.secret_key)
    if user is None:
        return login_redirect()
    return_path = safe_ui_return(return_to)
    form_values: dict[str, str | bool] = {
        "title": title,
        "body": body or "",
        "due_at": due_at or "",
        "subject": subject or "",
        "status_done": bool(status_done),
    }
    try:
        data = TaskCreate(
            title=title.strip(),
            body=_clean_optional(body),
            status="done" if status_done else "todo",
            due_at=parse_due_at(due_at),
            subject=_clean_optional(subject),
        )
    except (ValidationError, ValueError):
        return _task_form_response(
            request,
            user,
            task=None,
            heading="Новая задача",
            return_to=return_path,
            form_values=form_values,
            error="invalid",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    task_service.create_task(db, user, data)
    return RedirectResponse(
        url=return_path,
        status_code=HTTP_303_SEE_OTHER,
    )


@router.get("/tasks/{task_id}/edit")
def task_edit_page(
    request: Request,
    task_id: int,
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    return _task_editor_response(request, user, task_id=task_id, page_title="Редактировать задачу")


@router.get("/tasks/{task_id}/edit/preview", include_in_schema=False)
def task_edit_preview_redirect(
    request: Request,
    task_id: int,
):
    return canonical_ui_redirect(request, f"/ui/tasks/{task_id}/edit")


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
    """Compatibility-only form endpoint; the React editor uses the tasks API."""
    validate_csrf_token(request, csrf_token, settings.secret_key)
    if user is None:
        return login_redirect()
    task = task_service.find_task(db, user, task_id)
    if task is None:
        return RedirectResponse(url="/ui/tasks", status_code=HTTP_303_SEE_OTHER)
    return_path = safe_ui_return(return_to)
    form_values = {
        "title": title,
        "body": body or "",
        "due_at": "" if clear_due_at else due_at or "",
        "subject": subject or "",
        "status_done": bool(status_done),
    }
    try:
        due: datetime | None = None if clear_due_at else parse_due_at(due_at)
        data = TaskUpdate(
            title=title.strip(),
            body=_clean_optional(body),
            status="done" if status_done else "todo",
            due_at=due,
            subject=_clean_optional(subject),
        )
    except (ValidationError, ValueError):
        return _task_form_response(
            request,
            user,
            task=task,
            heading="Редактировать задачу",
            return_to=return_path,
            form_values=form_values,
            error="invalid",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    task_service.update_task(db, user, task_id, data)
    return RedirectResponse(
        url=return_path,
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
    """Compatibility-only form endpoint; the React pages use the tasks API."""
    validate_csrf_token(request, csrf_token, settings.secret_key)
    if user is None:
        return login_redirect()
    task_service.delete_task_if_exists(db, user, task_id)
    return RedirectResponse(
        url=safe_ui_return(return_to),
        status_code=HTTP_303_SEE_OTHER,
    )
