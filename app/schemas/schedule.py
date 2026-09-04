from pydantic import BaseModel, Field


class GroupsListResponse(BaseModel):
    count: int = Field(ge=0)
    groups: list[str]


class LessonResponse(BaseModel):
    name: str
    weeks: list[int]
    time_start: str
    time_end: str
    types: str
    teachers: list[str]
    rooms: list[str]


class ScheduleDayResponse(BaseModel):
    lessons: list[list[LessonResponse]]


class ScheduleResponse(BaseModel):
    group: str
    schedule: dict[str, ScheduleDayResponse]
