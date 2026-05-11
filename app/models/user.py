from __future__ import annotations

from sqlalchemy import Boolean, Date, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    first_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    patronymic: Mapped[str | None] = mapped_column(String(120), nullable=True)
    birth_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    group_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    avatar_base64: Mapped[str | None] = mapped_column(Text, nullable=True)

    tasks: Mapped[list["Task"]] = relationship(
        "Task",
        back_populates="owner",
        cascade="all, delete-orphan",
    )
