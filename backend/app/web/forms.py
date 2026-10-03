import re
from datetime import date, datetime, time

from fastapi import UploadFile
from fastapi.responses import RedirectResponse
from starlette.status import HTTP_303_SEE_OTHER

from app.core.avatar import MAX_AVATAR_BYTES, encode_avatar
from app.core.time import normalize_due_at

_SAFE_UI_RETURNS = {
    "/ui": "/ui",
    "/ui/preview": "/ui/preview",
    "/ui/calendar": "/ui/calendar",
    "/ui/calendar/preview": "/ui/calendar/preview",
    "/ui/profile": "/ui/profile",
    "/ui/profile/preview": "/ui/profile/preview",
    "/ui/tasks": "/ui/tasks",
    "/ui/tasks/preview": "/ui/tasks/preview",
    "/ui/tasks/preview?filter=active": "/ui/tasks/preview?filter=active",
    "/ui/tasks/preview?filter=today": "/ui/tasks/preview?filter=today",
    "/ui/tasks/preview?filter=overdue": "/ui/tasks/preview?filter=overdue",
    "/ui/tasks/preview?filter=done": "/ui/tasks/preview?filter=done",
    "/ui/tasks?filter=active": "/ui/tasks?filter=active",
    "/ui/tasks?filter=today": "/ui/tasks?filter=today",
    "/ui/tasks?filter=overdue": "/ui/tasks?filter=overdue",
    "/ui/tasks?filter=done": "/ui/tasks?filter=done",
}
_CALENDAR_RETURN = re.compile(
    r"/ui/calendar(?:/preview)?\?date=([0-9]{4}-[0-9]{2}-[0-9]{2})(?:&lesson=([0-9]{2}:[0-9]{2}))?"
)


def login_redirect() -> RedirectResponse:
    return RedirectResponse(url="/ui/login", status_code=HTTP_303_SEE_OTHER)


def parse_due_at(raw: str | None) -> datetime | None:
    if raw is None:
        return None
    value = raw.strip()
    if not value:
        return None
    return normalize_due_at(datetime.fromisoformat(value))


def safe_ui_return(value: str | None) -> str:
    if value in _SAFE_UI_RETURNS:
        return _SAFE_UI_RETURNS[value]
    if value is None:
        return "/ui/tasks"

    match = _CALENDAR_RETURN.fullmatch(value)
    if match is None:
        return "/ui/tasks"
    try:
        date.fromisoformat(match.group(1))
        if match.group(2) is not None:
            time.fromisoformat(match.group(2))
    except ValueError:
        return "/ui/tasks"
    return value


def encode_avatar_file(file: UploadFile | None) -> str | None:
    if file is None or not file.filename:
        return None
    raw = file.file.read(MAX_AVATAR_BYTES + 1)
    if not raw:
        return None
    return encode_avatar(file.content_type, raw)
