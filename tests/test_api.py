import base64
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.core.config import settings


def register_and_login(client: TestClient, email: str) -> dict[str, str]:
    password = "strong-password"
    register_response = client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_healthcheck(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_task_crud(client: TestClient) -> None:
    headers = register_and_login(client, "owner@example.com")

    create_response = client.post(
        "/tasks",
        headers=headers,
        json={"title": "Подготовиться к секции", "subject": "Алгоритмы"},
    )
    assert create_response.status_code == 201
    task_id = create_response.json()["id"]

    update_response = client.patch(
        f"/tasks/{task_id}",
        headers=headers,
        json={"status": "done"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "done"

    delete_response = client.delete(f"/tasks/{task_id}", headers=headers)
    assert delete_response.status_code == 204
    assert client.get(f"/tasks/{task_id}", headers=headers).status_code == 404


def test_user_cannot_read_another_users_task(client: TestClient) -> None:
    owner_headers = register_and_login(client, "first@example.com")
    stranger_headers = register_and_login(client, "second@example.com")

    create_response = client.post(
        "/tasks",
        headers=owner_headers,
        json={"title": "Личная задача"},
    )
    task_id = create_response.json()["id"]

    response = client.get(f"/tasks/{task_id}", headers=stranger_headers)

    assert response.status_code == 404


def test_calendar_renders_with_configured_schedule_url(client: TestClient) -> None:
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
    assert '"http://localhost:5000/api/schedule"' in response.text
    assert '"title": "Calendar task"' in response.text
    assert '"due_at": "2026-09-03T18:30"' in response.text
    assert '<script src="/static/calendar.js?v=1" defer></script>' in response.text
    assert "http://:5000" not in response.text


def test_web_task_filters_separate_active_and_completed_tasks(
    client: TestClient,
) -> None:
    headers = register_and_login(client, "task-filters@example.com")
    yesterday = datetime.now(timezone(timedelta(hours=3))) - timedelta(days=1)
    client.post(
        "/tasks",
        headers=headers,
        json={
            "title": "Активная лабораторная",
            "due_at": yesterday.replace(hour=12, minute=0).isoformat(),
        },
    )
    client.post(
        "/tasks",
        headers=headers,
        json={"title": "Готовый отчёт", "status": "done"},
    )

    active_response = client.get("/ui/tasks?filter=active", headers=headers)
    done_response = client.get("/ui/tasks?filter=done", headers=headers)
    overdue_response = client.get("/ui/tasks?filter=overdue", headers=headers)

    assert active_response.status_code == 200
    assert "Активная лабораторная" in active_response.text
    assert "Готовый отчёт" not in active_response.text
    assert done_response.status_code == 200
    assert "Готовый отчёт" in done_response.text
    assert "Активная лабораторная" not in done_response.text
    assert overdue_response.status_code == 200
    assert "Активная лабораторная" in overdue_response.text


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


def test_web_pages_keep_behavior_in_external_scripts(client: TestClient) -> None:
    headers = register_and_login(client, "external-scripts@example.com")

    dashboard = client.get("/ui", headers=headers)
    tasks = client.get("/ui/tasks", headers=headers)
    task_form = client.get("/ui/tasks/new", headers=headers)

    assert dashboard.status_code == 200
    assert 'id="dashboard-data" type="application/json"' in dashboard.text
    assert '<script src="/static/dashboard.js?v=1" defer></script>' in dashboard.text
    assert tasks.status_code == 200
    assert '<script src="/static/tasks.js?v=1" defer></script>' in tasks.text
    assert task_form.status_code == 200
    assert 'id="task-form-data" type="application/json"' in task_form.text
    assert '<script src="/static/task_form.js?v=1" defer></script>' in task_form.text


def test_public_auth_pages_render_new_forms(client: TestClient) -> None:
    login_response = client.get("/ui/login")
    register_response = client.get("/ui/register")

    assert login_response.status_code == 200
    assert "Один экран для пар, задач и дедлайнов" in login_response.text
    assert register_response.status_code == 200
    assert "Обязательны только почта и пароль" in register_response.text
    assert '<script src="/static/auth.js?v=1" defer></script>' in register_response.text


def test_web_registration_and_login_share_authentication_rules(
    client: TestClient,
) -> None:
    client.get("/ui/register")
    csrf_token = client.cookies.get("csrf_token")
    register_response = client.post(
        "/ui/register",
        data={
            "email": "  Web-Flow@Example.com ",
            "password": "strong-password",
            "first_name": "  Анна  ",
            "csrf_token": csrf_token,
        },
        follow_redirects=False,
    )

    assert register_response.status_code == 303
    assert register_response.headers["location"] == "/ui/login?ok=registered"

    login_response = client.post(
        "/ui/login",
        data={
            "email": "web-flow@example.com",
            "password": "strong-password",
            "csrf_token": csrf_token,
        },
        follow_redirects=False,
    )

    assert login_response.status_code == 303
    assert login_response.headers["location"] == "/ui"
    assert client.cookies.get("access_token")
    profile_response = client.get("/ui/profile")
    assert profile_response.status_code == 200
    assert "Анна" in profile_response.text


def test_html_forms_require_a_valid_csrf_token(client: TestClient) -> None:
    login_page = client.get("/ui/login")
    csrf_token = client.cookies.get("csrf_token")

    assert csrf_token
    assert f'name="csrf_token" value="{csrf_token}"' in login_page.text
    assert "HttpOnly" in login_page.headers["set-cookie"]
    assert "SameSite=lax" in login_page.headers["set-cookie"]

    rejected = client.post(
        "/ui/login",
        data={"email": "nobody@example.com", "password": "wrong-password"},
        follow_redirects=False,
    )
    assert rejected.status_code == 403

    accepted = client.post(
        "/ui/login",
        data={
            "email": "nobody@example.com",
            "password": "wrong-password",
            "csrf_token": csrf_token,
        },
        follow_redirects=False,
    )
    assert accepted.status_code == 303
    assert accepted.headers["location"] == "/ui/login?err=auth"


def test_cookie_authenticated_api_mutation_requires_csrf_header(
    client: TestClient,
) -> None:
    headers = register_and_login(client, "cookie-csrf@example.com")
    create_response = client.post(
        "/tasks",
        headers=headers,
        json={"title": "Protected task"},
    )
    task_id = create_response.json()["id"]
    token = headers["Authorization"].removeprefix("Bearer ")
    client.cookies.set("access_token", token)

    rejected = client.patch(
        f"/tasks/{task_id}",
        json={"status": "done"},
    )
    assert rejected.status_code == 403

    csrf_token = client.cookies.get("csrf_token")
    accepted = client.patch(
        f"/tasks/{task_id}",
        headers={"X-CSRF-Token": csrf_token},
        json={"status": "done"},
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "done"


def test_login_is_temporarily_blocked_after_repeated_failures(
    client: TestClient,
) -> None:
    credentials = {"email": "rate-limit@example.com", "password": "wrong-password"}

    for _ in range(settings.login_rate_limit_attempts - 1):
        response = client.post("/auth/login", json=credentials)
        assert response.status_code == 401

    blocked = client.post("/auth/login", json=credentials)

    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0


def test_avatar_rejects_content_that_does_not_match_image_type(
    client: TestClient,
) -> None:
    disguised_svg = base64.b64encode(b"<svg><script>alert(1)</script></svg>").decode()

    response = client.post(
        "/auth/register",
        json={
            "email": "invalid-avatar@example.com",
            "password": "strong-password",
            "avatar_base64": f"data:image/png;base64,{disguised_svg}",
        },
    )

    assert response.status_code == 422
