from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from tests.helpers import register_and_login


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
