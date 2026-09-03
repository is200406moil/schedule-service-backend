from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.repositories import user_repository

MIN_PASSWORD_LENGTH = 8


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class InactiveUserError(Exception):
    pass


class PasswordTooShortError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class RegistrationData:
    email: str
    password: str
    first_name: str | None = None
    last_name: str | None = None
    patronymic: str | None = None
    birth_date: date | None = None
    group_name: str | None = None
    avatar_base64: str | None = None


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def register_user(db: Session, data: RegistrationData) -> User:
    if len(data.password) < MIN_PASSWORD_LENGTH:
        raise PasswordTooShortError
    email = normalize_email(data.email)
    if user_repository.get_by_email(db, email) is not None:
        raise EmailAlreadyRegisteredError
    return user_repository.create(
        db,
        email=email,
        password_hash=hash_password(data.password),
        first_name=_clean_optional(data.first_name),
        last_name=_clean_optional(data.last_name),
        patronymic=_clean_optional(data.patronymic),
        birth_date=data.birth_date,
        group_name=_clean_optional(data.group_name),
        avatar_base64=data.avatar_base64,
    )


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = user_repository.get_by_email(db, normalize_email(email))
    if user is None or not verify_password(password, user.password_hash):
        raise InvalidCredentialsError
    if not user.is_active:
        raise InactiveUserError
    return user


def create_access_token_for_user(user: User) -> str:
    return create_access_token(
        subject=str(user.id),
        secret_key=settings.secret_key,
        expires_minutes=settings.access_token_expire_minutes,
    )
