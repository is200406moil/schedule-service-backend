from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def create(
    db: Session,
    *,
    email: str,
    password_hash: str,
    first_name: str | None = None,
    last_name: str | None = None,
    patronymic: str | None = None,
    birth_date=None,
    group_name: str | None = None,
    avatar_base64: str | None = None,
) -> User:
    user = User(
        email=email,
        password_hash=password_hash,
        first_name=first_name,
        last_name=last_name,
        patronymic=patronymic,
        birth_date=birth_date,
        group_name=group_name,
        avatar_base64=avatar_base64,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update(db: Session, user: User, data: dict) -> User:
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user
