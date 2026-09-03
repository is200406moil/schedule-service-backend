from datetime import datetime

from fastapi import UploadFile
from fastapi.responses import RedirectResponse
from starlette.status import HTTP_303_SEE_OTHER

from app.core.avatar import MAX_AVATAR_BYTES, encode_avatar
from app.core.time import normalize_due_at


def login_redirect() -> RedirectResponse:
    return RedirectResponse(url="/ui/login", status_code=HTTP_303_SEE_OTHER)


def parse_due_at(raw: str | None) -> datetime | None:
    if raw is None:
        return None
    value = raw.strip()
    if not value:
        return None
    return normalize_due_at(datetime.fromisoformat(value))


def safe_ui_return(value: str | None, default: str = "/ui/tasks") -> str:
    if value and value.startswith("/ui") and not value.startswith("//"):
        return value
    return default


def encode_avatar_file(file: UploadFile | None) -> str | None:
    if file is None or not file.filename:
        return None
    raw = file.file.read(MAX_AVATAR_BYTES + 1)
    if not raw:
        return None
    return encode_avatar(file.content_type, raw)
