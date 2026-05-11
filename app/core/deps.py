from collections.abc import Generator

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import TokenDecodeError, get_token_subject
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
    return request.cookies.get(ACCESS_TOKEN_COOKIE)


def _user_from_token(db: Session, token: str) -> User:
    try:
        sub = get_token_subject(token, settings.secret_key)
        user_id = int(sub)
    except (TokenDecodeError, ValueError) as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    user = user_repository.get_by_id(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
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
        sub = get_token_subject(token, settings.secret_key)
        user_id = int(sub)
    except (TokenDecodeError, ValueError):
        return None
    user = user_repository.get_by_id(db, user_id)
    if user is None or not user.is_active:
        return None
    return user
