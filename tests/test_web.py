from fastapi.testclient import TestClient

from tests.helpers import register_and_login


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


def test_web_pages_load_external_page_assets(client: TestClient) -> None:
    headers = register_and_login(client, "external-assets@example.com")

    dashboard = client.get("/ui", headers=headers)
    tasks = client.get("/ui/tasks", headers=headers)
    task_form = client.get("/ui/tasks/new", headers=headers)

    assert dashboard.status_code == 200
    assert 'id="dashboard-data" type="application/json"' in dashboard.text
    assert '<script src="/static/dashboard.js?v=1" defer></script>' in dashboard.text
    for stylesheet in (
        "base",
        "dashboard",
        "tasks",
        "calendar",
        "profile",
        "auth",
    ):
        assert f'href="/static/css/{stylesheet}.css?v=1"' in dashboard.text
    assert tasks.status_code == 200
    assert '<script src="/static/tasks.js?v=1" defer></script>' in tasks.text
    assert task_form.status_code == 200
    assert 'id="task-form-data" type="application/json"' in task_form.text
    assert '<script src="/static/task_form.js?v=1" defer></script>' in task_form.text
