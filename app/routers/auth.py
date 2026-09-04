from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.rate_limit import (
    login_rate_limit_key,
    login_rate_limiter,
    raise_rate_limit,
)
from app.models import User
from app.schemas.auth import LoginRequest, Token
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import auth_service, user_service

router = APIRouter()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
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
        return auth_service.register_user(db, registration)
    except auth_service.EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from exc


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
