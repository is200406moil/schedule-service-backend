from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from starlette.status import HTTP_303_SEE_OTHER

from app.core.avatar import AvatarValidationError
from app.core.config import settings
from app.core.csrf import validate_csrf_token
from app.core.deps import ACCESS_TOKEN_COOKIE, get_current_user_optional, get_db
from app.core.rate_limit import login_rate_limit_key, login_rate_limiter
from app.models import User
from app.services import auth_service
from app.web.forms import encode_avatar_file
from app.web.templates import templates

router = APIRouter()


def _cookie_response(token: str, *, location: str) -> RedirectResponse:
    response = RedirectResponse(url=location, status_code=HTTP_303_SEE_OTHER)
    response.set_cookie(
        ACCESS_TOKEN_COOKIE,
        token,
        httponly=True,
        max_age=settings.access_token_expire_minutes * 60,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return response


def _clear_auth_cookie(response: RedirectResponse) -> RedirectResponse:
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    return response


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
    normalized_email = auth_service.normalize_email(email)
    rate_limit_key = login_rate_limit_key(request, normalized_email)
    if login_rate_limiter.retry_after(rate_limit_key) is not None:
        return RedirectResponse(
            url="/ui/login?err=rate",
            status_code=HTTP_303_SEE_OTHER,
        )
    try:
        user = auth_service.authenticate_user(db, normalized_email, password)
    except auth_service.InvalidCredentialsError:
        retry_after = login_rate_limiter.record_failure(rate_limit_key)
        error = "rate" if retry_after is not None else "auth"
        return RedirectResponse(
            url=f"/ui/login?err={error}",
            status_code=HTTP_303_SEE_OTHER,
        )
    except auth_service.InactiveUserError:
        return RedirectResponse(
            url="/ui/login?err=inactive",
            status_code=HTTP_303_SEE_OTHER,
        )
    login_rate_limiter.reset(rate_limit_key)
    token = auth_service.create_access_token_for_user(user)
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
    try:
        avatar_base64 = encode_avatar_file(avatar_file)
    except AvatarValidationError:
        return RedirectResponse(
            url="/ui/register?err=avatar",
            status_code=HTTP_303_SEE_OTHER,
        )
    registration = auth_service.RegistrationData(
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        patronymic=patronymic,
        birth_date=datetime.fromisoformat(birth_date).date() if birth_date else None,
        group_name=group_name,
        avatar_base64=avatar_base64,
    )
    try:
        auth_service.register_user(db, registration)
    except auth_service.PasswordTooShortError:
        return RedirectResponse(
            url="/ui/register?err=short",
            status_code=HTTP_303_SEE_OTHER,
        )
    except auth_service.EmailAlreadyRegisteredError:
        return RedirectResponse(
            url="/ui/register?err=exists",
            status_code=HTTP_303_SEE_OTHER,
        )
    return RedirectResponse(
        url="/ui/login?ok=registered",
        status_code=HTTP_303_SEE_OTHER,
    )


@router.post("/logout")
def logout(request: Request, csrf_token: str | None = Form(None)):
    validate_csrf_token(request, csrf_token, settings.secret_key)
    response = RedirectResponse(url="/ui/login", status_code=HTTP_303_SEE_OTHER)
    return _clear_auth_cookie(response)
