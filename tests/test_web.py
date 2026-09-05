from datetime import UTC, datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.core.time import datetime_local_value, normalize_due_at
from app.schemas.task import TaskCreate
from app.web.forms import safe_ui_return
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


def test_calendar_uses_internal_schedule_proxy(client: TestClient) -> None:
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
    assert '"scheduleApi": "/schedule"' in response.text
    assert '"title": "Calendar task"' in response.text
    assert '"due_at": "2026-09-03T18:30"' in response.text
    assert '<script src="/static/calendar.js?v=1" defer></script>' in response.text
    assert "localhost:5000/api/schedule" not in response.text


def test_profile_shows_progress_and_only_upcoming_active_tasks(
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
    assert "Задачи семестра" in response.text
    assert "Upcoming profile task" in response.text
    assert "Completed profile task" not in response.text
    assert '<script src="/static/profile.js?v=1" defer></script>' in response.text


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
        "/ui/calendar": "/ui/calendar",
        "/ui/profile": "/ui/profile",
        "/ui/tasks": "/ui/tasks",
        "/ui/tasks?filter=overdue": "/ui/tasks?filter=overdue",
    }

    for value, expected in allowed.items():
        assert safe_ui_return(value) == expected

    for unsafe in (
        "https://example.com/ui/tasks",
        "//example.com/ui/tasks",
        "/ui\\example.com",
        "/ui/tasks?filter=done&next=https://example.com",
        "/ui/calendar?date=not-validated",
    ):
        assert safe_ui_return(unsafe) == "/ui/tasks"


def test_web_pages_load_external_page_assets(client: TestClient) -> None:
    headers = register_and_login(client, "external-assets@example.com")

    dashboard = client.get("/ui", headers=headers)
    calendar = client.get("/ui/calendar", headers=headers)
    tasks = client.get("/ui/tasks", headers=headers)
    task_form = client.get("/ui/tasks/new", headers=headers)
    profile = client.get("/ui/profile", headers=headers)

    pages = {
        "dashboard": dashboard,
        "calendar": calendar,
        "tasks": tasks,
        "task_form": task_form,
        "profile": profile,
    }
    for response in pages.values():
        assert response.status_code == 200
        assert 'href="/static/css/base.css?v=3"' in response.text
        assert 'href="/static/css/app.css?v=2"' in response.text

    page_styles = {
        "dashboard": "dashboard",
        "calendar": "calendar",
        "tasks": "tasks",
        "task_form": "tasks",
        "profile": "profile",
    }
    for page_name, response in pages.items():
        expected = page_styles[page_name]
        if expected:
            version = 2 if expected in {"tasks", "profile"} else 1
            assert f'href="/static/css/{expected}.css?v={version}"' in response.text
        for stylesheet in {"dashboard", "calendar", "tasks", "profile", "auth"} - {expected}:
            assert f"/static/css/{stylesheet}.css" not in response.text

    assert 'id="dashboard-data" type="application/json"' in dashboard.text
    assert '<script src="/static/dashboard.js?v=1" defer></script>' in dashboard.text
    assert 'id="calendar-data" type="application/json"' in calendar.text
    assert '<script src="/static/calendar.js?v=1" defer></script>' in calendar.text
    assert '<script src="/static/tasks.js?v=2" defer></script>' in tasks.text
    assert "onsubmit=" not in tasks.text
    assert task_form.text.count('class="required-label"') == 1
    assert 'id="task-form-data" type="application/json"' in task_form.text
    assert '<script src="/static/autocomplete.js?v=1" defer></script>' in task_form.text
    assert '<script src="/static/task_form.js?v=1" defer></script>' in task_form.text
    assert '<script src="/static/autocomplete.js?v=1" defer></script>' in profile.text
    assert '<script src="/static/profile.js?v=1" defer></script>' in profile.text
