from sqlalchemy.orm import Session

from app.models import User
from app.repositories import user_repository


def update_user(db: Session, user: User, updates: dict[str, object]) -> User:
    if not updates:
        return user
    return user_repository.update(db, user, updates)
