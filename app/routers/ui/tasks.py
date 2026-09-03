from datetime import datetime

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from starlette.status import HTTP_303_SEE_OTHER

from app.core.config import settings
from app.core.csrf import validate_csrf_token
from app.core.deps import get_current_user_optional, get_db
from app.models import User
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import task_service
from app.web.forms import login_redirect, parse_due_at, safe_ui_return
from app.web.presentation import is_overdue, moscow_today, task_sections
from app.web.templates import templates

router = APIRouter()


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
            task.status != "done" and task.due_at is not None and task.due_at.date() == today
            for task in all_tasks
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
            if task.status != "done" and task.due_at is not None and task.due_at.date() == today
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
    return templates.TemplateResponse(
        request=request,
        name="task_form.html",
        context={
            "user": user,
            "task": None,
            "heading": "Новая задача",
            "return_to": safe_ui_return(request.query_params.get("return_to")),
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
        return login_redirect()
    body_clean = None if body is None or body.strip() == "" else body.strip()
    data = TaskCreate(
        title=title.strip(),
        body=body_clean,
        status="done" if status_done else "todo",
        due_at=parse_due_at(due_at),
        subject=subject.strip() if subject else None,
    )
    task_service.create_task(db, user, data)
    return RedirectResponse(
        url=safe_ui_return(return_to),
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
    return templates.TemplateResponse(
        request=request,
        name="task_form.html",
        context={
            "user": user,
            "task": task,
            "heading": "Редактировать задачу",
            "return_to": safe_ui_return(request.query_params.get("return_to")),
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
        return login_redirect()
    if task_service.find_task(db, user, task_id) is None:
        return RedirectResponse(url="/ui/tasks", status_code=HTTP_303_SEE_OTHER)
    body_clean = None if body is None or body.strip() == "" else body.strip()
    due: datetime | None = None if clear_due_at else parse_due_at(due_at)
    data = TaskUpdate(
        title=title.strip(),
        body=body_clean,
        status="done" if status_done else "todo",
        due_at=due,
        subject=subject.strip() if subject else None,
    )
    task_service.update_task(db, user, task_id, data)
    return RedirectResponse(
        url=safe_ui_return(return_to),
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
