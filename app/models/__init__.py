"""ORM-модели; импорт всех сущностей для регистрации в Base.metadata (Alembic)."""

from app.models.user import User
from app.models.task import Task

__all__ = ["Task", "User"]
