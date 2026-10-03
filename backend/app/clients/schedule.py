from typing import TypeVar
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ValidationError

from app.schemas.schedule import GroupsListResponse, ScheduleResponse

ResponseModel = TypeVar("ResponseModel", bound=BaseModel)


class ScheduleClientError(RuntimeError):
    """Base error for communication with Schedule API."""


class ScheduleNotFoundError(ScheduleClientError):
    """The requested schedule data does not exist upstream."""


class ScheduleTimeoutError(ScheduleClientError):
    """Schedule API did not respond within the configured timeout."""


class ScheduleUpstreamError(ScheduleClientError):
    """Schedule API is unreachable or returned an invalid response."""


class ScheduleClient:
    def __init__(
        self,
        base_url: str,
        timeout_seconds: float,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._http = httpx.AsyncClient(
            base_url=f"{base_url.rstrip('/')}/",
            timeout=httpx.Timeout(timeout_seconds),
            transport=transport,
            trust_env=False,
        )

    async def close(self) -> None:
        await self._http.aclose()

    async def list_groups(self) -> GroupsListResponse:
        return await self._get("groups", GroupsListResponse)

    async def get_full_schedule(self, group: str) -> ScheduleResponse:
        encoded_group = quote(group, safe="")
        return await self._get(f"{encoded_group}/full_schedule", ScheduleResponse)

    async def _get(self, path: str, model: type[ResponseModel]) -> ResponseModel:
        try:
            response = await self._http.get(path)
        except httpx.TimeoutException as error:
            raise ScheduleTimeoutError("Schedule API request timed out") from error
        except httpx.RequestError as error:
            raise ScheduleUpstreamError("Schedule API is unavailable") from error

        if response.status_code == httpx.codes.NOT_FOUND:
            raise ScheduleNotFoundError("Schedule data was not found")
        if response.is_error:
            raise ScheduleUpstreamError(f"Schedule API returned HTTP {response.status_code}")

        try:
            return model.model_validate(response.json())
        except (ValueError, ValidationError) as error:
            raise ScheduleUpstreamError("Schedule API returned invalid data") from error
