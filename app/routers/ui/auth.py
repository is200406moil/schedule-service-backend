from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status
from fastapi.responses import RedirectResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.status import HTTP_303_SEE_OTHER

from app.core.avatar import AvatarValidationError
from app.core.config import settings
from app.core.csrf import validate_csrf_token
from app.core.deps import ACCESS_TOKEN_COOKIE, get_current_user_optional, get_db
from app.core.rate_limit import login_rate_limit_key, login_rate_limiter
from app.models import User
from app.schemas.auth import LoginRequest
from app.schemas.user import UserCreate
from app.services import auth_service
from app.web.forms import encode_avatar_file
from app.web.templates import templates

router = APIRouter()


def _login_response(
    request: Request,
    *,
    error: str | None = None,
    ok: str | None = None,
    email: str = "",
    status_code: int = status.HTTP_200_OK,
):
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"user": None, "error": error, "ok": ok, "email": email},
        status_code=status_code,
    )


def _register_response(
    request: Request,
    *,
    error: str | None = None,
    form_values: dict[str, str] | None = None,
    status_code: int = status.HTTP_200_OK,
):
    return templates.TemplateResponse(
        request=request,
        name="register.html",
        context={
            "user": None,
            "error": error,
            "form_values": form_values or {},
        },
        status_code=status_code,
    )


def _registration_error(exc: ValidationError) -> str:
    field = exc.errors()[0]["loc"][0]
    return {
        "email": "email",
        "password": "password",
        "birth_date": "date",
    }.get(str(field), "invalid")


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
    return _login_response(
        request,
        error=request.query_params.get("err"),
        ok=request.query_params.get("ok"),
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
    submitted_email = email.strip()
    try:
        credentials = LoginRequest(email=submitted_email, password=password)
    except ValidationError:
        return _login_response(
            request,
            error="email",
            email=submitted_email,
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    normalized_email = auth_service.normalize_email(str(credentials.email))
    rate_limit_key = login_rate_limit_key(request, normalized_email)
    retry_after = login_rate_limiter.retry_after(rate_limit_key)
    if retry_after is not None:
        return _login_response(
            request,
            error="rate",
            email=submitted_email,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    try:
        user = auth_service.authenticate_user(db, normalized_email, credentials.password)
    except auth_service.InvalidCredentialsError:
        retry_after = login_rate_limiter.record_failure(rate_limit_key)
        error = "rate" if retry_after is not None else "auth"
        return _login_response(
            request,
            error=error,
            email=submitted_email,
            status_code=(
                status.HTTP_429_TOO_MANY_REQUESTS
                if retry_after is not None
                else status.HTTP_401_UNAUTHORIZED
            ),
        )
    except auth_service.InactiveUserError:
        return _login_response(
            request,
            error="inactive",
            email=submitted_email,
            status_code=status.HTTP_403_FORBIDDEN,
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
    return _register_response(request, error=request.query_params.get("err"))


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
    form_values = {
        "email": email.strip(),
        "first_name": first_name or "",
        "last_name": last_name or "",
        "patronymic": patronymic or "",
        "birth_date": birth_date or "",
        "group_name": group_name or "",
    }
    try:
        avatar_base64 = encode_avatar_file(avatar_file)
    except AvatarValidationError:
        return _register_response(
            request,
            error="avatar",
            form_values=form_values,
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    try:
        data = UserCreate(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            patronymic=patronymic,
            birth_date=birth_date or None,
            group_name=group_name,
            avatar_base64=avatar_base64,
        )
    except ValidationError as exc:
        return _register_response(
            request,
            error=_registration_error(exc),
            form_values=form_values,
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    registration = auth_service.RegistrationData(
        email=str(data.email),
        password=data.password,
        first_name=data.first_name,
        last_name=data.last_name,
        patronymic=data.patronymic,
        birth_date=data.birth_date,
        group_name=data.group_name,
        avatar_base64=data.avatar_base64,
    )
    try:
        auth_service.register_user(db, registration)
    except auth_service.PasswordTooShortError:
        return _register_response(
            request,
            error="password",
            form_values=form_values,
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    except auth_service.EmailAlreadyRegisteredError:
        return _register_response(
            request,
            error="exists",
            form_values=form_values,
            status_code=status.HTTP_409_CONFLICT,
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
