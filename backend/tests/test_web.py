import json
import re
from datetime import UTC, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.time import datetime_local_value, normalize_due_at
from app.schemas.task import TaskCreate
from app.web.forms import safe_ui_return
from app.web.presentation import moscow_today
from tests.helpers import register_and_login


def test_deadlines_are_stored_as_utc_and_rendered_in_moscow_time() -> None:
    task = TaskCreate(
        title="Timezone task",
        due_at=datetime(2026, 9, 3, 18, 30, tzinfo=timezone(timedelta(hours=3))),
    )

    assert task.due_at == datetime(2026, 9, 3, 15, 30, tzinfo=UTC)
    assert normalize_due_at(datetime(2026, 9, 3, 18, 30)) == datetime(
        2026, 9, 3, 15, 30, tzinfo=UTC
    )
    assert datetime_local_value(datetime(2026, 9, 3, 15, 30, tzinfo=UTC)) == ("2026-09-03T18:30")


def test_task_api_keeps_utc_deadline_when_sqlite_returns_naive_datetime(
    client: TestClient,
) -> None:
    headers = register_and_login(client, "timezone-api@example.com")
    created = client.post(
        "/tasks",
        headers=headers,
        json={"title": "API deadline", "due_at": "2026-09-03T18:30:00+03:00"},
    )

    assert created.status_code == 201
    assert created.json()["due_at"] == "2026-09-03T15:30:00Z"
    listed = client.get("/tasks", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["due_at"] == "2026-09-03T15:30:00Z"


def test_calendar_boots_react_without_inlining_a_legacy_task_snapshot(client: TestClient) -> None:
    headers = register_and_login(client, "calendar@example.com")
    client.post(
        "/tasks",
        headers=headers,
        json={
            "title": "Calendar task",
            "subject": "Algorithms",
            "due_at": "2026-09-03T18:30:00+03:00",
        },
    )

    response = client.get("/ui/calendar", headers=headers)

    assert response.status_code == 200
    assert 'id="page-data" type="application/json"' in response.text
    assert '"title": "Calendar task"' not in response.text
    assert 'src="/static/react/assets/calendar-test.js"' in response.text
    assert "localhost:5000/api/schedule" not in response.text
    assert client.get("/tasks", headers=headers).json()[0]["title"] == "Calendar task"


def test_profile_boots_react_without_inlining_a_legacy_task_snapshot(
    client: TestClient,
) -> None:
    headers = register_and_login(client, "profile@example.com")
    client.post(
        "/tasks",
        headers=headers,
        json={"title": "Upcoming profile task", "subject": "Backend"},
    )
    client.post(
        "/tasks",
        headers=headers,
        json={"title": "Completed profile task", "status": "done"},
    )

    response = client.get("/ui/profile", headers=headers)

    assert response.status_code == 200
    assert 'id="page-data" type="application/json"' in response.text
    assert "Upcoming profile task" not in response.text
    assert "Completed profile task" not in response.text
    assert 'src="/static/react/assets/profile-test.js"' in response.text


def test_profile_details_can_be_cleared_without_avatar_form_overwriting_them(
    client: TestClient,
) -> None:
    headers = register_and_login(client, "profile-fields@example.com")
    updated = client.patch(
        "/auth/me",
        headers=headers,
        json={
            "first_name": "Анна",
            "last_name": "Иванова",
            "patronymic": "Игоревна",
            "birth_date": "2004-04-20",
            "group_name": "ИКБО-14-23",
        },
    )
    assert updated.status_code == 200

    profile = client.get("/ui/profile", headers=headers)
    csrf_token = client.cookies.get("csrf_token")
    assert profile.status_code == 200
    avatar_only = client.post(
        "/ui/profile",
        headers=headers,
        data={"form_kind": "avatar", "csrf_token": csrf_token},
        follow_redirects=False,
    )
    assert avatar_only.status_code == 303
    assert client.get("/auth/me", headers=headers).json()["first_name"] == "Анна"

    cleared = client.post(
        "/ui/profile",
        headers=headers,
        data={
            "form_kind": "details",
            "first_name": "",
            "last_name": "",
            "patronymic": "",
            "birth_date": "",
            "group_name": "",
            "csrf_token": csrf_token,
        },
        follow_redirects=False,
    )

    assert cleared.status_code == 303
    user = client.get("/auth/me", headers=headers).json()
    assert user["first_name"] is None
    assert user["last_name"] is None
    assert user["patronymic"] is None
    assert user["birth_date"] is None
    assert user["group_name"] is None


def test_profile_form_rejects_invalid_date_without_server_error(
    client: TestClient,
) -> None:
    headers = register_and_login(client, "profile-validation@example.com")
    client.get("/ui/profile", headers=headers)
    csrf_token = client.cookies.get("csrf_token")

    response = client.post(
        "/ui/profile",
        headers=headers,
        data={
            "form_kind": "details",
            "first_name": "Анна",
            "birth_date": "2025-99-99",
            "csrf_token": csrf_token,
        },
    )

    assert response.status_code == 422
    assert "одно из полей заполнено неверно" in response.text
    assert '"openEdit": true' in response.text
    assert client.get("/auth/me", headers=headers).json()["first_name"] is None


def test_task_forms_reject_invalid_values_without_losing_input(
    client: TestClient,
) -> None:
    headers = register_and_login(client, "task-form-validation@example.com")
    client.get("/ui/tasks/new", headers=headers)
    csrf_token = client.cookies.get("csrf_token")

    invalid_create = client.post(
        "/ui/tasks/new",
        headers=headers,
        data={
            "title": "Подготовить отчёт",
            "body": "Черновик описания",
            "due_at": "not-a-date",
            "subject": "Backend",
            "csrf_token": csrf_token,
        },
    )

    assert invalid_create.status_code == 422
    assert "Проверьте название, срок и длину заполненных полей" in invalid_create.text
    assert 'value="Подготовить отчёт"' in invalid_create.text
    assert "Черновик описания" in invalid_create.text
    assert 'value="not-a-date"' in invalid_create.text
    assert client.get("/tasks", headers=headers).json() == []

    created = client.post("/tasks", headers=headers, json={"title": "Исходное название"})
    task_id = created.json()["id"]
    invalid_edit = client.post(
        f"/ui/tasks/{task_id}/edit",
        headers=headers,
        data={
            "title": "   ",
            "status_done": "1",
            "csrf_token": csrf_token,
        },
    )

    assert invalid_edit.status_code == 422
    assert 'id="status-done" value="1" checked' in invalid_edit.text
    assert client.get(f"/tasks/{task_id}", headers=headers).json()["title"] == ("Исходное название")


def test_task_return_destination_uses_an_exact_allowlist() -> None:
    allowed = {
        "/ui": "/ui",
        "/ui/preview": "/ui",
        "/ui/calendar": "/ui/calendar",
        "/ui/calendar/preview": "/ui/calendar",
        "/ui/profile": "/ui/profile",
        "/ui/profile/preview": "/ui/profile",
        "/ui/tasks": "/ui/tasks",
        "/ui/tasks?filter=all": "/ui/tasks?filter=all",
        "/ui/tasks?filter=overdue": "/ui/tasks?filter=overdue",
        "/ui/tasks/preview": "/ui/tasks",
        "/ui/tasks/preview?filter=all": "/ui/tasks?filter=all",
        "/ui/tasks/preview?filter=active": "/ui/tasks?filter=active",
        "/ui/tasks/preview?filter=today": "/ui/tasks?filter=today",
        "/ui/tasks/preview?filter=overdue": "/ui/tasks?filter=overdue",
        "/ui/tasks/preview?filter=done": "/ui/tasks?filter=done",
    }

    for value, expected in allowed.items():
        assert safe_ui_return(value) == expected

    assert safe_ui_return("/ui/calendar?date=2026-09-03") == "/ui/calendar?date=2026-09-03"
    assert safe_ui_return("/ui/calendar/preview?date=2026-09-03") == "/ui/calendar?date=2026-09-03"
    assert (
        safe_ui_return("/ui/calendar?date=2026-09-03&lesson=09:00")
        == "/ui/calendar?date=2026-09-03&lesson=09:00"
    )
    assert (
        safe_ui_return("/ui/calendar/preview?date=2026-09-03&lesson=09:00")
        == "/ui/calendar?date=2026-09-03&lesson=09:00"
    )
    assert (
        safe_ui_return("/ui/calendar/preview?date=2026-09-03&lesson=09%3A00")
        == "/ui/calendar?date=2026-09-03&lesson=09%3A00"
    )

    for unsafe in (
        "https://example.com/ui/tasks",
        "//example.com/ui/tasks",
        "/ui\\example.com",
        "/ui/tasks?filter=done&next=https://example.com",
        "/ui/tasks/preview?filter=unknown",
        "/ui/tasks/preview?filter=active&next=https://example.com",
        "/ui/tasks/preview?filter=active&filter=done",
        "/ui/tasks/preview/extra",
        "/ui/tasks/preview#done",
        "/ui/calendar?date=not-validated",
        "/ui/calendar?date=2026-02-30",
        "/ui/calendar?date=2026-09-03&lesson=25:00",
        "/ui/calendar?date=2026-09-03&lesson=25%3A00",
        "/ui/calendar?date=2026-09-03&next=https://example.com",
        "/ui/calendar/preview?date=2026-02-30",
        "/ui/calendar/preview?date=2026-09-03&next=https://example.com",
        "/ui/calendar/preview?date=2026-09-03&lesson=09:00&lesson=10:00",
        "/ui/calendar/preview?date=2026-09-03&lesson=09:00#outside",
        "/ui/preview?next=https://example.com",
    ):
        assert safe_ui_return(unsafe) == "/ui/tasks"


@pytest.mark.parametrize("calendar_path", ["/ui/calendar", "/ui/calendar/preview"])
def test_calendar_task_returns_to_selected_day(client: TestClient, calendar_path: str) -> None:
    headers = register_and_login(client, "calendar-return@example.com")
    client.get("/ui/calendar", headers=headers)
    csrf_token = client.cookies.get("csrf_token")

    response = client.post(
        "/ui/tasks/new",
        headers=headers,
        data={
            "title": "Задача для пары",
            "return_to": f"{calendar_path}?date=2026-09-03&lesson=09:00",
            "csrf_token": csrf_token,
        },
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"] == "/ui/calendar?date=2026-09-03&lesson=09:00"


def test_react_overview_uses_same_origin_built_assets(
    client: TestClient,
    monkeypatch,
) -> None:
    headers = register_and_login(client, "react-preview@example.com")
    monkeypatch.setattr(
        "app.routers.ui.dashboard.react_assets",
        lambda: {
            "react_script": "/static/react/assets/main-test.js",
            "react_styles": ["/static/react/assets/main-test.css"],
        },
    )

    response = client.get("/ui", headers=headers)

    assert response.status_code == 200
    assert '<script id="page-data" type="application/json">' in response.text
    assert 'src="/static/react/assets/main-test.js"' in response.text
    assert 'href="/static/react/assets/main-test.css"' in response.text
    assert "'unsafe-inline'" not in response.headers["Content-Security-Policy"]


@pytest.mark.parametrize(
    "path",
    ["/ui", "/ui/calendar", "/ui/tasks", "/ui/tasks/new", "/ui/tasks/123/edit", "/ui/profile"],
)
def test_canonical_react_pages_redirect_unauthenticated_user(client: TestClient, path: str) -> None:
    response = client.get(path, follow_redirects=False)

    assert response.status_code == 303
    assert response.headers["location"] == "/ui/login"


def test_react_tasks_boots_selected_filter_and_same_origin_assets(
    client: TestClient,
    monkeypatch,
) -> None:
    headers = register_and_login(client, "react-tasks@example.com")
    requested_entries: list[str] = []

    def fake_react_assets(entry: str) -> dict[str, object]:
        requested_entries.append(entry)
        return {
            "react_script": "/static/react/assets/tasks-test.js",
            "react_styles": ["/static/react/assets/tasks-test.css"],
        }

    monkeypatch.setattr("app.routers.ui.tasks.react_assets", fake_react_assets)

    response = client.get("/ui/tasks?filter=today", headers=headers)

    assert response.status_code == 200
    assert requested_entries == ["src/entries/tasks-main.tsx"]
    assert "Задачи · Мой семестр" in response.text
    boot_match = re.search(
        r'<script id="page-data" type="application/json">(.*?)</script>',
        response.text,
    )
    assert boot_match is not None
    boot_data = json.loads(boot_match.group(1))
    assert boot_data["initialFilter"] == "today"
    assert boot_data["csrfToken"] == client.cookies.get("csrf_token")
    assert 'src="/static/react/assets/tasks-test.js"' in response.text
    assert 'href="/static/react/assets/tasks-test.css"' in response.text
    assert "'unsafe-inline'" not in response.headers["Content-Security-Policy"]


def test_react_new_task_editor_boots_subject_and_safe_canonical_return(
    client: TestClient,
    monkeypatch,
) -> None:
    headers = register_and_login(client, "react-task-editor-new@example.com")
    updated = client.patch(
        "/auth/me",
        headers=headers,
        json={"first_name": "Анна", "group_name": "ИКБО-14-23"},
    )
    assert updated.status_code == 200
    requested_entries: list[str] = []

    def fake_react_assets(entry: str) -> dict[str, object]:
        requested_entries.append(entry)
        return {
            "react_script": "/static/react/assets/task-editor-test.js",
            "react_styles": ["/static/react/assets/task-editor-test.css"],
        }

    monkeypatch.setattr("app.routers.ui.tasks.react_assets", fake_react_assets)
    subject = "<script>alert('x')</script>" + "М" * 300
    response = client.get(
        "/ui/tasks/new",
        headers=headers,
        params={
            "return_to": "/ui/calendar/preview?date=2026-09-03",
            "subject": subject,
        },
    )

    assert response.status_code == 200
    assert requested_entries == ["src/entries/task-editor-main.tsx"]
    assert "Новая задача · Мой семестр" in response.text
    boot_match = re.search(
        r'<script id="page-data" type="application/json">(.*?)</script>',
        response.text,
    )
    assert boot_match is not None
    boot_data = json.loads(boot_match.group(1))
    assert boot_data == {
        "firstName": "Анна",
        "group": "ИКБО-14-23",
        "avatar": "",
        "today": moscow_today().isoformat(),
        "csrfToken": client.cookies.get("csrf_token"),
        "taskId": None,
        "returnTo": "/ui/calendar?date=2026-09-03",
        "initialSubject": subject[:255],
    }
    assert "<script>alert" not in response.text
    assert 'src="/static/react/assets/task-editor-test.js"' in response.text
    assert 'href="/static/react/assets/task-editor-test.css"' in response.text


def test_react_edit_task_editor_exposes_only_task_id_and_api_checks_ownership(
    client: TestClient,
    monkeypatch,
) -> None:
    owner_headers = register_and_login(client, "react-task-editor-owner@example.com")
    created = client.post(
        "/tasks",
        headers=owner_headers,
        json={"title": "Owner secret task", "body": "Private task body"},
    )
    assert created.status_code == 201
    task_id = created.json()["id"]
    other_headers = register_and_login(client, "react-task-editor-other@example.com")
    monkeypatch.setattr(
        "app.routers.ui.tasks.react_assets",
        lambda entry: {
            "react_script": "/static/react/assets/task-editor-test.js",
            "react_styles": [],
        },
    )

    response = client.get(
        f"/ui/tasks/{task_id}/edit",
        headers=other_headers,
        params={"return_to": "https://outside.example", "subject": "Free text"},
    )

    assert response.status_code == 200
    assert "Редактировать задачу · Мой семестр" in response.text
    boot_match = re.search(
        r'<script id="page-data" type="application/json">(.*?)</script>',
        response.text,
    )
    assert boot_match is not None
    boot_data = json.loads(boot_match.group(1))
    assert boot_data["taskId"] == task_id
    assert boot_data["returnTo"] == "/ui/tasks"
    assert boot_data["initialSubject"] == "Free text"
    assert "Owner secret task" not in response.text
    assert "Private task body" not in response.text
    assert client.get(f"/tasks/{task_id}", headers=other_headers).status_code == 404


def test_react_calendar_keeps_date_and_same_origin_assets(
    client: TestClient,
    monkeypatch,
) -> None:
    headers = register_and_login(client, "react-calendar@example.com")
    monkeypatch.setattr(
        "app.routers.ui.calendar.react_assets",
        lambda entry: {
            "react_script": "/static/react/assets/calendar-test.js",
            "react_styles": ["/static/react/assets/calendar-test.css"],
        },
    )

    response = client.get("/ui/calendar?date=2026-09-03&lesson=09:00", headers=headers)

    assert response.status_code == 200
    assert "Календарь · Мой семестр" in response.text
    assert '"initialDate": "2026-09-03"' in response.text
    assert '"initialLesson": "09:00"' in response.text
    assert 'src="/static/react/assets/calendar-test.js"' in response.text
    assert "'unsafe-inline'" not in response.headers["Content-Security-Policy"]


def test_canonical_web_pages_only_load_their_react_assets(client: TestClient) -> None:
    headers = register_and_login(client, "external-assets@example.com")
    pages = {
        "/ui": "overview",
        "/ui/calendar": "calendar",
        "/ui/tasks": "tasks",
        "/ui/tasks/new": "task-editor",
        "/ui/tasks/123/edit": "task-editor",
        "/ui/profile": "profile",
    }
    for path, page in pages.items():
        response = client.get(path, headers=headers)
        assert response.status_code == 200
        assert 'id="page-data" type="application/json"' in response.text
        assert f'src="/static/react/assets/{page}-test.js"' in response.text
        assert f'href="/static/react/assets/{page}-test.css"' in response.text
        assert "/static/css/" not in response.text
        assert "onsubmit=" not in response.text
        assert "'unsafe-inline'" not in response.headers["Content-Security-Policy"]
        for legacy_script in ("dashboard", "calendar", "tasks", "task_form", "profile"):
            assert f"/static/{legacy_script}.js" not in response.text


@pytest.mark.parametrize(
    ("preview_path", "canonical_path", "query"),
    [
        ("/ui/preview", "/ui", "welcome=1"),
        ("/ui/calendar/preview", "/ui/calendar", "date=2026-09-03&lesson=09%3A00"),
        ("/ui/tasks/preview", "/ui/tasks", "filter=done"),
        (
            "/ui/tasks/new/preview",
            "/ui/tasks/new",
            "subject=%D0%9C%D0%B0%D1%82%D0%B5%D0%BC%D0%B0%D1%82%D0%B8%D0%BA%D0%B0"
            "&return_to=%2Fui%2Fcalendar%3Fdate%3D2026-09-03%26lesson%3D09%3A00",
        ),
        (
            "/ui/tasks/123/edit/preview",
            "/ui/tasks/123/edit",
            "return_to=%2Fui%2Ftasks%3Ffilter%3Dactive",
        ),
        ("/ui/profile/preview", "/ui/profile", "edit=1"),
    ],
)
def test_preview_aliases_preserve_query_strings_and_do_not_render_pages(
    client: TestClient,
    preview_path: str,
    canonical_path: str,
    query: str,
    monkeypatch,
) -> None:
    def unexpected_assets(*args, **kwargs):
        raise AssertionError("A preview alias must not render a page")

    for module in ("dashboard", "calendar", "tasks", "profile"):
        monkeypatch.setattr(f"app.routers.ui.{module}.react_assets", unexpected_assets)

    for suffix in ("", f"?{query}"):
        response = client.get(f"{preview_path}{suffix}", follow_redirects=False)

        assert response.status_code == 308
        assert response.headers["location"] == f"{canonical_path}{suffix}"
        assert 'id="page-data"' not in response.text
    assert preview_path not in client.get("/openapi.json").json()["paths"]
