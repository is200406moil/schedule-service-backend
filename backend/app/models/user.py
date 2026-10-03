from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.task import Task


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    auth_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    first_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    patronymic: Mapped[str | None] = mapped_column(String(120), nullable=True)
    birth_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    group_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    avatar_base64: Mapped[str | None] = mapped_column(Text, nullable=True)

    tasks: Mapped[list[Task]] = relationship(
        "Task",
        back_populates="owner",
        cascade="all, delete-orphan",
    )

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None
