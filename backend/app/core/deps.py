from collections.abc import Generator

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.csrf import CSRF_HEADER, validate_csrf_token
from app.core.database import SessionLocal
from app.core.security import TokenDecodeError, get_token_auth_version, get_token_subject
from app.models import User
from app.repositories import user_repository

ACCESS_TOKEN_COOKIE = "access_token"

security = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_raw_access_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str | None:
    if credentials is not None:
        return credentials.credentials
    token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    if (
        token is not None
        and request.method not in {"GET", "HEAD", "OPTIONS", "TRACE"}
        and not request.url.path.startswith("/ui")
    ):
        validate_csrf_token(
            request,
            request.headers.get(CSRF_HEADER),
            settings.secret_key,
        )
    return token


def _user_from_token(db: Session, token: str) -> User:
    try:
        sub = get_token_subject(token, settings.secret_key)
        user_id = int(sub)
        auth_version = get_token_auth_version(token, settings.secret_key)
    except (TokenDecodeError, ValueError) as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    user = user_repository.get_by_id(db, user_id)
    if user is None or not user.is_active or user.auth_version != auth_version:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if settings.mail_mode != "disabled" and not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="email-unverified")
    return user


def get_current_user(
    db: Session = Depends(get_db),
    token: str | None = Depends(get_raw_access_token),
) -> User:
    if token is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _user_from_token(db, token)


def get_current_user_optional(
    db: Session = Depends(get_db),
    token: str | None = Depends(get_raw_access_token),
) -> User | None:
    if token is None:
        return None
    try:
        return _user_from_token(db, token)
    except HTTPException:
        return None
