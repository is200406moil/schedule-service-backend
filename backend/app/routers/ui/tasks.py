from datetime import datetime

from fastapi import APIRouter, Depends, Form, Request, status
from fastapi.responses import RedirectResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.status import HTTP_303_SEE_OTHER

from app.core.config import settings
from app.core.csrf import validate_csrf_token
from app.core.deps import get_current_user_optional, get_db
from app.core.time import datetime_local_value, moscow_date
from app.models import Task, User
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import task_service
from app.web.forms import login_redirect, parse_due_at, safe_ui_return
from app.web.frontend import preview_assets
from app.web.presentation import is_overdue, moscow_today, task_sections
from app.web.templates import templates

router = APIRouter()


@router.get("/tasks/preview", include_in_schema=False)
def tasks_preview(
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
            "page_title": "Задачи",
            **preview_assets("src/entries/tasks-main.tsx"),
            "preview_data": {
                "firstName": user.first_name or "",
                "group": user.group_name or "",
                "avatar": user.avatar_base64 or "",
                "today": moscow_today().isoformat(),
                "csrfToken": request.state.csrf_token,
                "initialFilter": request.query_params.get("filter"),
            },
        },
    )


def _task_editor_preview(request: Request, user: User, *, task_id: int | None, page_title: str):
    subject = request.query_params.get("subject")
    requested_return = request.query_params.get("return_to")
    return_to = safe_ui_return(requested_return)
    if requested_return is None or (return_to == "/ui/tasks" and requested_return != "/ui/tasks"):
        return_to = "/ui/tasks/preview"
    return templates.TemplateResponse(
        request=request,
        name="preview.html",
        context={
            "user": user,
            "page_title": page_title,
            **preview_assets("src/entries/task-editor-main.tsx"),
            "preview_data": {
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


@router.get("/tasks")
def tasks_list(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    all_tasks = task_service.list_tasks(db, user)
    today = moscow_today()
    counts = {
        "all": len(all_tasks),
        "active": sum(task.status != "done" for task in all_tasks),
        "today": sum(
            task.status != "done" and moscow_date(task.due_at) == today for task in all_tasks
        ),
        "overdue": sum(task.status != "done" and is_overdue(task.due_at) for task in all_tasks),
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
            if task.status != "done" and moscow_date(task.due_at) == today
        ]
    elif task_filter == "overdue":
        tasks = [task for task in all_tasks if task.status != "done" and is_overdue(task.due_at)]
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


@router.get("/tasks/new")
def task_new_form(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    return _task_form_response(
        request,
        user,
        task=None,
        heading="Новая задача",
        return_to=safe_ui_return(request.query_params.get("return_to")),
    )


@router.get("/tasks/new/preview", include_in_schema=False)
def task_new_preview(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    return _task_editor_preview(request, user, task_id=None, page_title="Новая задача")


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
def task_edit_form(
    request: Request,
    task_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    task = task_service.find_task(db, user, task_id)
    if task is None:
        return RedirectResponse(url="/ui/tasks", status_code=HTTP_303_SEE_OTHER)
    return _task_form_response(
        request,
        user,
        task=task,
        heading="Редактировать задачу",
        return_to=safe_ui_return(request.query_params.get("return_to")),
    )


@router.get("/tasks/{task_id}/edit/preview", include_in_schema=False)
def task_edit_preview(
    request: Request,
    task_id: int,
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    return _task_editor_preview(request, user, task_id=task_id, page_title="Редактировать задачу")


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
    validate_csrf_token(request, csrf_token, settings.secret_key)
    if user is None:
        return login_redirect()
    task_service.delete_task_if_exists(db, user, task_id)
    return RedirectResponse(
        url=safe_ui_return(return_to),
        status_code=HTTP_303_SEE_OTHER,
    )
