import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients import (
    ScheduleClient,
    ScheduleNotFoundError,
    ScheduleTimeoutError,
    ScheduleUpstreamError,
)
from app.main import app
from app.routers.schedule import get_schedule_client
from app.schemas.schedule import GroupsListResponse, ScheduleResponse

LESSON = {
    "name": "Алгоритмы и структуры данных",
    "weeks": [1, 2],
    "time_start": "09:00",
    "time_end": "10:30",
    "types": "Лекция",
    "teachers": ["Иванов И. И."],
    "rooms": ["А-101"],
}
SCHEDULE = {
    "group": "ИКБО-10-24",
    "schedule": {"1": {"lessons": [[LESSON]]}},
}


def test_schedule_client_validates_groups_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/schedule/groups"
        return httpx.Response(200, json={"count": 2, "groups": ["ИКБО-10-24", "ИКБО-11-24"]})

    async def request_groups() -> GroupsListResponse:
        schedule_client = ScheduleClient(
            "http://schedule.test/api/schedule",
            timeout_seconds=1,
            transport=httpx.MockTransport(handler),
        )
        try:
            return await schedule_client.list_groups()
        finally:
            await schedule_client.close()

    groups = asyncio.run(request_groups())

    assert groups.count == 2
    assert groups.groups == ["ИКБО-10-24", "ИКБО-11-24"]


def test_schedule_client_validates_full_schedule_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.raw_path == (
            b"/api/schedule/%D0%98%D0%9A%D0%91%D0%9E-10-24/full_schedule"
        )
        return httpx.Response(200, json=SCHEDULE)

    async def request_schedule() -> ScheduleResponse:
        schedule_client = ScheduleClient(
            "http://schedule.test/api/schedule",
            timeout_seconds=1,
            transport=httpx.MockTransport(handler),
        )
        try:
            return await schedule_client.get_full_schedule("ИКБО-10-24")
        finally:
            await schedule_client.close()

    schedule = asyncio.run(request_schedule())

    assert schedule.group == "ИКБО-10-24"
    assert schedule.schedule["1"].lessons[0][0].name == "Алгоритмы и структуры данных"


def test_schedule_client_rejects_invalid_upstream_data() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"count": "invalid", "groups": {}})

    async def request_groups() -> None:
        schedule_client = ScheduleClient(
            "http://schedule.test/api/schedule",
            timeout_seconds=1,
            transport=httpx.MockTransport(handler),
        )
        try:
            with pytest.raises(ScheduleUpstreamError, match="invalid data"):
                await schedule_client.list_groups()
        finally:
            await schedule_client.close()

    asyncio.run(request_groups())


def test_schedule_client_reports_upstream_http_error() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"detail": "maintenance"})

    async def request_groups() -> None:
        schedule_client = ScheduleClient(
            "http://schedule.test/api/schedule",
            timeout_seconds=1,
            transport=httpx.MockTransport(handler),
        )
        try:
            with pytest.raises(ScheduleUpstreamError, match="HTTP 503"):
                await schedule_client.list_groups()
        finally:
            await schedule_client.close()

    asyncio.run(request_groups())


def test_schedule_client_reports_missing_schedule() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"detail": "not found"})

    async def request_schedule() -> None:
        schedule_client = ScheduleClient(
            "http://schedule.test/api/schedule",
            timeout_seconds=1,
            transport=httpx.MockTransport(handler),
        )
        try:
            with pytest.raises(ScheduleNotFoundError, match="not found"):
                await schedule_client.get_full_schedule("ИКБО-00-00")
        finally:
            await schedule_client.close()

    asyncio.run(request_schedule())


def test_schedule_client_reports_connection_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    async def request_groups() -> None:
        schedule_client = ScheduleClient(
            "http://schedule.test/api/schedule",
            timeout_seconds=1,
            transport=httpx.MockTransport(handler),
        )
        try:
            with pytest.raises(ScheduleUpstreamError, match="unavailable"):
                await schedule_client.list_groups()
        finally:
            await schedule_client.close()

    asyncio.run(request_groups())


def test_schedule_client_reports_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("upstream is slow", request=request)

    async def request_schedule() -> None:
        schedule_client = ScheduleClient(
            "http://schedule.test/api/schedule",
            timeout_seconds=1,
            transport=httpx.MockTransport(handler),
        )
        try:
            with pytest.raises(ScheduleTimeoutError, match="timed out"):
                await schedule_client.get_full_schedule("ИКБО-10-24")
        finally:
            await schedule_client.close()

    asyncio.run(request_schedule())


def test_schedule_proxy_returns_validated_upstream_data(client: TestClient) -> None:
    class FakeScheduleClient:
        async def list_groups(self) -> GroupsListResponse:
            return GroupsListResponse(count=1, groups=["ИКБО-10-24"])

        async def get_full_schedule(self, group: str) -> ScheduleResponse:
            assert group == "ИКБО-10-24"
            return ScheduleResponse.model_validate(SCHEDULE)

    app.dependency_overrides[get_schedule_client] = FakeScheduleClient

    groups_response = client.get("/schedule/groups")
    schedule_response = client.get("/schedule/ИКБО-10-24/full_schedule")

    assert groups_response.status_code == 200
    assert groups_response.json() == {"count": 1, "groups": ["ИКБО-10-24"]}
    assert schedule_response.status_code == 200
    assert schedule_response.json()["schedule"]["1"]["lessons"][0][0] == LESSON


def test_schedule_proxy_maps_upstream_timeout_to_gateway_timeout(client: TestClient) -> None:
    class TimedOutScheduleClient:
        async def list_groups(self) -> GroupsListResponse:
            raise ScheduleTimeoutError("timeout")

    app.dependency_overrides[get_schedule_client] = TimedOutScheduleClient

    response = client.get("/schedule/groups")

    assert response.status_code == 504
    assert response.json() == {"detail": "Schedule service timed out"}


def test_schedule_proxy_maps_missing_schedule_to_not_found(client: TestClient) -> None:
    class MissingScheduleClient:
        async def get_full_schedule(self, _: str) -> ScheduleResponse:
            raise ScheduleNotFoundError("not found")

    app.dependency_overrides[get_schedule_client] = MissingScheduleClient

    response = client.get("/schedule/ИКБО-00-00/full_schedule")

    assert response.status_code == 404
    assert response.json() == {"detail": "Schedule data was not found"}


def test_schedule_proxy_maps_connection_error_to_bad_gateway(client: TestClient) -> None:
    class UnavailableScheduleClient:
        async def list_groups(self) -> GroupsListResponse:
            raise ScheduleUpstreamError("connection refused")

    app.dependency_overrides[get_schedule_client] = UnavailableScheduleClient

    response = client.get("/schedule/groups")

    assert response.status_code == 502
    assert response.json() == {"detail": "Schedule service is unavailable"}
