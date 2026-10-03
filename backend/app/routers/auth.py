from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import ACCESS_TOKEN_COOKIE, get_current_user, get_db
from app.core.mail import MailSender, get_mail_sender
from app.core.rate_limit import (
    login_rate_limit_key,
    login_rate_limiter,
    raise_rate_limit,
    require_recovery_confirm_rate,
    require_recovery_request_rate,
    require_verification_confirm_rate,
    require_verification_request_rate,
)
from app.models import User
from app.schemas.auth import (
    EmailVerificationConfirm,
    EmailVerificationRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    Token,
)
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import (
    auth_service,
    email_verification_service,
    password_reset_service,
    user_service,
)

router = APIRouter()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(
    data: UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: MailSender = Depends(get_mail_sender),
):
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
    except auth_service.EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from exc
    if settings.mail_mode != "disabled":
        email_verification_service.queue_email_verification(
            background_tasks, db, user.email, sender
        )
    return user


@router.post("/login", response_model=Token)
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)) -> Token:
    email = auth_service.normalize_email(str(data.email))
    rate_limit_key = login_rate_limit_key(request, email)
    retry_after = login_rate_limiter.retry_after(rate_limit_key)
    if retry_after is not None:
        raise_rate_limit(retry_after)
    try:
        user = auth_service.authenticate_user(db, email, data.password)
    except auth_service.InvalidCredentialsError as exc:
        retry_after = login_rate_limiter.record_failure(rate_limit_key)
        if retry_after is not None:
            raise_rate_limit(retry_after)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        ) from exc
    except auth_service.EmailUnverifiedError as exc:
        login_rate_limiter.reset(rate_limit_key)
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="email-unverified") from exc
    login_rate_limiter.reset(rate_limit_key)
    return Token(access_token=auth_service.create_access_token_for_user(user))


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserRead)
def update_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updates = data.model_dump(exclude_unset=True)
    return user_service.update_user(db, current_user, updates)


@router.post(
    "/password-reset/request",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_recovery_request_rate)],
)
def request_password_reset(
    data: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: MailSender = Depends(get_mail_sender),
):
    if settings.mail_mode == "disabled":
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="unavailable")
    password_reset_service.queue_password_reset(background_tasks, db, str(data.email), sender)
    return JSONResponse(
        {"detail": "requested"},
        status_code=status.HTTP_202_ACCEPTED,
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@router.post("/password-reset/confirm", dependencies=[Depends(require_recovery_confirm_rate)])
def confirm_password_reset(
    data: PasswordResetConfirm,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: MailSender = Depends(get_mail_sender),
):
    if data.password != data.password_confirm:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="mismatch")
    try:
        email = password_reset_service.confirm_password_reset(db, data.token, data.password)
    except password_reset_service.InvalidResetTokenError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="token") from exc
    background_tasks.add_task(password_reset_service.send_password_changed, email, sender)
    response = JSONResponse(
        {"detail": "password-reset"},
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    return response


@router.post(
    "/email-verification/request",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_verification_request_rate)],
)
def request_email_verification(
    data: EmailVerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: MailSender = Depends(get_mail_sender),
):
    if settings.mail_mode == "disabled":
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="unavailable")
    email_verification_service.queue_email_verification(
        background_tasks, db, str(data.email), sender
    )
    return JSONResponse(
        {"detail": "requested"},
        status_code=status.HTTP_202_ACCEPTED,
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@router.post(
    "/email-verification/confirm", dependencies=[Depends(require_verification_confirm_rate)]
)
def confirm_email_verification(
    data: EmailVerificationConfirm,
    db: Session = Depends(get_db),
):
    try:
        email_verification_service.confirm_email_verification(db, data.token)
    except email_verification_service.InvalidVerificationTokenError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="token") from exc
    response = JSONResponse(
        {"detail": "email-verified"},
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    return response
