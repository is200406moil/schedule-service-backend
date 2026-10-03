"""ORM-модели; импорт всех сущностей для регистрации в Base.metadata (Alembic)."""

from app.models.task import Task
from app.models.user import User

__all__ = ["Task", "User"]
