from fastapi import Request

from app.core.config import settings
from app.web.frontend import preview_assets
from app.web.templates import templates


def public_response(request: Request, data: dict, *, title: str, status_code: int = 200):
    """Provide boot data and assets; all public UI belongs to frontend/features/auth."""
    return templates.TemplateResponse(
        request=request,
        name="public.html",
        context={
            "page_title": title,
            "public_data": data,
            **preview_assets("src/entries/auth-main.tsx"),
        },
        status_code=status_code,
        headers={"Cache-Control": "no-store"},
    )


def recovery_response(
    request: Request,
    *,
    page: str,
    email: str = "",
    error: str | None = None,
    ok: str | None = None,
    status_code: int = 200,
    retry_after: int | None = None,
):
    response = public_response(
        request,
        {
            "page": page,
            "csrfToken": request.state.csrf_token,
            "email": email,
            "error": error,
            "ok": ok,
            "mailMode": settings.mail_mode,
        },
        title="Восстановление пароля" if page == "forgot-password" else "Новый пароль",
        status_code=status_code,
    )
    response.headers["Referrer-Policy"] = "no-referrer"
    if retry_after is not None:
        response.headers["Retry-After"] = str(retry_after)
    return response


def verification_response(
    request: Request,
    *,
    page: str,
    email: str = "",
    error: str | None = None,
    ok: str | None = None,
    status_code: int = 200,
    retry_after: int | None = None,
):
    response = public_response(
        request,
        {
            "page": page,
            "csrfToken": request.state.csrf_token,
            "email": email,
            "error": error,
            "ok": ok,
            "mailMode": settings.mail_mode,
            "verificationRequired": settings.mail_mode != "disabled",
        },
        title="Подтверждение почты",
        status_code=status_code,
    )
    response.headers["Referrer-Policy"] = "no-referrer"
    if retry_after is not None:
        response.headers["Retry-After"] = str(retry_after)
    return response
