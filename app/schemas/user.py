from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    patronymic: str | None = Field(default=None, max_length=120)
    birth_date: date | None = None
    group_name: str | None = Field(default=None, max_length=64)
    avatar_base64: str | None = None


class UserUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    patronymic: str | None = Field(default=None, max_length=120)
    birth_date: date | None = None
    group_name: str | None = Field(default=None, max_length=64)
    avatar_base64: str | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    is_active: bool
    first_name: str | None = None
    last_name: str | None = None
    patronymic: str | None = None
    birth_date: date | None = None
    group_name: str | None = None
    avatar_base64: str | None = None
