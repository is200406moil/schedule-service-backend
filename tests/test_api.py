from fastapi.testclient import TestClient


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
