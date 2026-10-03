import logging
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status

from app.clients import (
    ScheduleClient,
    ScheduleClientError,
    ScheduleNotFoundError,
    ScheduleTimeoutError,
)
from app.schemas.schedule import GroupsListResponse, ScheduleResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def get_schedule_client(request: Request) -> ScheduleClient:
    return request.app.state.schedule_client


def _raise_upstream_http_error(error: ScheduleClientError) -> NoReturn:
    logger.warning("Schedule API request failed: %s", error)
    if isinstance(error, ScheduleNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule data was not found",
        ) from error
    if isinstance(error, ScheduleTimeoutError):
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Schedule service timed out",
        ) from error
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Schedule service is unavailable",
    ) from error


@router.get("/groups", response_model=GroupsListResponse)
async def list_groups(
    client: ScheduleClient = Depends(get_schedule_client),
) -> GroupsListResponse:
    try:
        return await client.list_groups()
    except ScheduleClientError as error:
        _raise_upstream_http_error(error)


@router.get("/{group}/full_schedule", response_model=ScheduleResponse)
async def get_full_schedule(
    group: str = Path(min_length=10, max_length=64),
    client: ScheduleClient = Depends(get_schedule_client),
) -> ScheduleResponse:
    try:
        return await client.get_full_schedule(group)
    except ScheduleClientError as error:
        _raise_upstream_http_error(error)
