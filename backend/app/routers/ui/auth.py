from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import RedirectResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.status import HTTP_303_SEE_OTHER

from app.core.avatar import AvatarValidationError
from app.core.config import settings
from app.core.csrf import validate_csrf_token
from app.core.deps import ACCESS_TOKEN_COOKIE, get_current_user_optional, get_db
from app.core.mail import MailSender, get_mail_sender
from app.core.rate_limit import (
    get_recovery_confirm_retry_after,
    get_recovery_request_retry_after,
    login_rate_limit_key,
    login_rate_limiter,
)
from app.models import User
from app.schemas.auth import LoginRequest, PasswordResetRequest
from app.schemas.user import UserCreate
from app.services import auth_service, email_verification_service, password_reset_service
from app.web.forms import encode_avatar_file
from app.web.public import public_response, verification_response
from app.web.public import recovery_response as _recovery_response

router = APIRouter()


def _login_response(
    request: Request,
    *,
    error: str | None = None,
    ok: str | None = None,
    email: str = "",
    status_code: int = status.HTTP_200_OK,
):
    return public_response(
        request,
        {
            "page": "login",
            "csrfToken": request.state.csrf_token,
            "error": error,
            "ok": ok,
            "email": email,
        },
        title="Вход",
        status_code=status_code,
    )


def _register_response(
    request: Request,
    *,
    error: str | None = None,
    form_values: dict[str, str] | None = None,
    status_code: int = status.HTTP_200_OK,
):
    return public_response(
        request,
        {
            "page": "register",
            "csrfToken": request.state.csrf_token,
            "error": error,
            "ok": None,
            "email": (form_values or {}).get("email", ""),
            "mailMode": settings.mail_mode,
            "verificationRequired": settings.mail_mode != "disabled",
        },
        title="Регистрация",
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
    email: str = Form(""),
    password: str = Form(""),
    csrf_token: str | None = Form(None),
):
    submitted_email = email.strip()
    try:
        validate_csrf_token(request, csrf_token, settings.secret_key)
    except HTTPException as exc:
        if exc.status_code != status.HTTP_403_FORBIDDEN:
            raise
        return _login_response(
            request,
            error="csrf",
            email=submitted_email,
            status_code=status.HTTP_403_FORBIDDEN,
        )
    try:
        credentials = LoginRequest(email=submitted_email, password=password)
    except ValidationError as exc:
        return _login_response(
            request,
            error="email" if exc.errors()[0]["loc"][0] == "email" else "password",
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
    except auth_service.EmailUnverifiedError:
        login_rate_limiter.reset(rate_limit_key)
        return verification_response(
            request,
            page="email-verification",
            email=normalized_email,
            error="unverified",
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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: MailSender = Depends(get_mail_sender),
    email: str = Form(""),
    password: str = Form(""),
    first_name: str | None = Form(None),
    last_name: str | None = Form(None),
    patronymic: str | None = Form(None),
    birth_date: str | None = Form(None),
    group_name: str | None = Form(None),
    avatar_file: UploadFile | None = File(None),
    csrf_token: str | None = Form(None),
):
    form_values = {
        "email": email.strip(),
        "first_name": first_name or "",
        "last_name": last_name or "",
        "patronymic": patronymic or "",
        "birth_date": birth_date or "",
        "group_name": group_name or "",
    }
    try:
        validate_csrf_token(request, csrf_token, settings.secret_key)
    except HTTPException as exc:
        if exc.status_code != status.HTTP_403_FORBIDDEN:
            raise
        return _register_response(
            request,
            error="csrf",
            form_values=form_values,
            status_code=status.HTTP_403_FORBIDDEN,
        )
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
        user = auth_service.register_user(db, registration)
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
    if settings.mail_mode != "disabled":
        email_verification_service.queue_email_verification(
            background_tasks, db, user.email, sender
        )
    return RedirectResponse(
        url=(
            "/ui/email-verification?ok=registered"
            if settings.mail_mode != "disabled"
            else "/ui/login?ok=registered"
        ),
        status_code=HTTP_303_SEE_OTHER,
    )


@router.post("/logout")
def logout(request: Request, csrf_token: str | None = Form(None)):
    validate_csrf_token(request, csrf_token, settings.secret_key)
    response = RedirectResponse(url="/ui/login", status_code=HTTP_303_SEE_OTHER)
    return _clear_auth_cookie(response)


def _recovery_redirect(location: str) -> RedirectResponse:
    return RedirectResponse(
        url=location,
        status_code=HTTP_303_SEE_OTHER,
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@router.get("/forgot-password")
def forgot_password_page(request: Request):
    return _recovery_response(
        request,
        page="forgot-password",
        ok="requested" if request.query_params.get("ok") == "requested" else None,
    )


@router.post("/forgot-password")
def forgot_password_submit(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: MailSender = Depends(get_mail_sender),
    retry_after: int | None = Depends(get_recovery_request_retry_after),
    email: str = Form(""),
    csrf_token: str | None = Form(None),
):
    submitted_email = email.strip()
    if retry_after is not None:
        return _recovery_response(
            request,
            page="forgot-password",
            email=submitted_email,
            error="rate",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            retry_after=retry_after,
        )
    try:
        validate_csrf_token(request, csrf_token, settings.secret_key)
    except HTTPException:
        return _recovery_response(
            request,
            page="forgot-password",
            email=submitted_email,
            error="csrf",
            status_code=status.HTTP_403_FORBIDDEN,
        )
    try:
        data = PasswordResetRequest(email=submitted_email)
    except ValidationError:
        return _recovery_response(
            request,
            page="forgot-password",
            email=submitted_email,
            error="email",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    if settings.mail_mode == "disabled":
        return _recovery_response(
            request,
            page="forgot-password",
            email=submitted_email,
            error="unavailable",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    password_reset_service.queue_password_reset(background_tasks, db, str(data.email), sender)
    return _recovery_redirect("/ui/forgot-password?ok=requested")


@router.get("/password-reset")
def password_reset_page(request: Request):
    # Link secrets live in the browser fragment. Opening this page never claims a token.
    return _recovery_response(request, page="password-reset")


@router.post("/password-reset")
def password_reset_submit(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: MailSender = Depends(get_mail_sender),
    retry_after: int | None = Depends(get_recovery_confirm_retry_after),
    token: str = Form(""),
    password: str = Form(""),
    password_confirm: str = Form(""),
    csrf_token: str | None = Form(None),
):
    if retry_after is not None:
        return _recovery_response(
            request,
            page="password-reset",
            error="rate",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            retry_after=retry_after,
        )
    try:
        validate_csrf_token(request, csrf_token, settings.secret_key)
    except HTTPException:
        return _recovery_response(
            request,
            page="password-reset",
            error="csrf",
            status_code=status.HTTP_403_FORBIDDEN,
        )
    if password != password_confirm:
        return _recovery_response(
            request,
            page="password-reset",
            error="mismatch",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    if not auth_service.MIN_PASSWORD_LENGTH <= len(password) <= 128:
        return _recovery_response(
            request,
            page="password-reset",
            error="password",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    try:
        email = password_reset_service.confirm_password_reset(db, token, password)
    except password_reset_service.InvalidResetTokenError:
        return _recovery_response(
            request,
            page="password-reset",
            error="token",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    background_tasks.add_task(password_reset_service.send_password_changed, email, sender)
    return _clear_auth_cookie(_recovery_redirect("/ui/login?ok=password-reset#"))
