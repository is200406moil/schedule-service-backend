from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.core.rate_limit import (
    login_rate_limit_key,
    login_rate_limiter,
    raise_rate_limit,
)
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.repositories import user_repository
from app.schemas.auth import LoginRequest, Token
from app.schemas.user import UserCreate, UserRead, UserUpdate

router = APIRouter()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    email = _normalize_email(str(data.email))
    if user_repository.get_by_email(db, email):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    user = user_repository.create(
        db,
        email=email,
        password_hash=hash_password(data.password),
        first_name=data.first_name,
        last_name=data.last_name,
        patronymic=data.patronymic,
        birth_date=data.birth_date,
        group_name=data.group_name,
        avatar_base64=data.avatar_base64,
    )
    return user


@router.post("/login", response_model=Token)
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)) -> Token:
    email = _normalize_email(str(data.email))
    rate_limit_key = login_rate_limit_key(request, email)
    retry_after = login_rate_limiter.retry_after(rate_limit_key)
    if retry_after is not None:
        raise_rate_limit(retry_after)
    user = user_repository.get_by_email(db, email)
    if user is None or not verify_password(data.password, user.password_hash):
        retry_after = login_rate_limiter.record_failure(rate_limit_key)
        if retry_after is not None:
            raise_rate_limit(retry_after)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Inactive user")
    login_rate_limiter.reset(rate_limit_key)
    token = create_access_token(
        subject=str(user.id),
        secret_key=settings.secret_key,
        expires_minutes=settings.access_token_expire_minutes,
    )
    return Token(access_token=token)


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
    if not updates:
        return current_user
    return user_repository.update(db, current_user, updates)
