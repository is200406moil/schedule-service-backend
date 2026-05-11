from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


TaskStatus = Literal["todo", "done"]


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    body: str | None = None
    status: TaskStatus = "todo"
    due_at: datetime | None = None
    subject: str | None = Field(default=None, max_length=255)


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    body: str | None = None
    status: TaskStatus | None = None
    due_at: datetime | None = None
    subject: str | None = Field(default=None, max_length=255)


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    body: str | None
    status: str
    due_at: datetime | None
    subject: str | None
    created_at: datetime
    updated_at: datetime
