import json
import re

from fastapi.testclient import TestClient

from app.web.forms import safe_ui_return
from app.web.presentation import moscow_today
from tests.helpers import register_and_login


def _boot_data(response_text: str) -> dict[str, object]:
    match = re.search(
        r'<script id="page-data" type="application/json">(.*?)</script>',
        response_text,
    )
    assert match is not None
    return json.loads(match.group(1))


def test_profile_redirects_unauthenticated_user(client: TestClient) -> None:
    response = client.get("/ui/profile", follow_redirects=False)

    assert response.status_code == 303
    assert response.headers["location"] == "/ui/login"


def test_profile_task_return_normalizes_legacy_preview_path() -> None:
    assert safe_ui_return("/ui/profile/preview") == "/ui/profile"
    for unsafe in (
        "/ui/profile/preview/extra",
        "/ui/profile/preview?next=https://outside.example",
        "/ui/profile/preview#settings",
        "https://outside.example/ui/profile/preview",
        "//outside.example/ui/profile/preview",
    ):
        assert safe_ui_return(unsafe) == "/ui/tasks"


def test_profile_boots_current_user_and_same_origin_assets(
    client: TestClient,
    monkeypatch,
) -> None:
    headers = register_and_login(client, "react-profile@example.com")
    updated = client.patch(
        "/auth/me",
        headers=headers,
        json={
            "first_name": "Анна",
            "last_name": "Иванова",
            "patronymic": "Игоревна",
            "birth_date": "2004-04-20",
            "group_name": "ИКБО-14-23",
            "avatar_base64": (
                "data:image/png;base64,"
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4y0AAAAASUVORK5CYII="
            ),
        },
    )
    assert updated.status_code == 200
    requested_entries: list[str] = []

    def fake_react_assets(entry: str) -> dict[str, object]:
        requested_entries.append(entry)
        return {
            "react_script": "/static/react/assets/profile-test.js",
            "react_styles": ["/static/react/assets/profile-test.css"],
        }

    monkeypatch.setattr("app.routers.ui.profile.react_assets", fake_react_assets)

    response = client.get("/ui/profile", headers=headers)

    assert response.status_code == 200
    assert requested_entries == ["src/entries/profile-main.tsx"]
    assert "Профиль · Мой семестр" in response.text
    assert _boot_data(response.text) == {
        "firstName": "Анна",
        "group": "ИКБО-14-23",
        "avatar": "",
        "today": moscow_today().isoformat(),
        "csrfToken": client.cookies.get("csrf_token"),
        "profile": updated.json(),
        "initialEdit": False,
    }
    assert "password_hash" not in response.text
    assert response.text.count("iVBORw0KGgoAAAANSUhEUg") == 1
    assert 'src="/static/react/assets/profile-test.js"' in response.text
    assert 'href="/static/react/assets/profile-test.css"' in response.text
    assert "'unsafe-inline'" not in response.headers["Content-Security-Policy"]
    assert _boot_data(client.get("/ui/profile?edit=1", headers=headers).text)["initialEdit"] is True


def test_profile_escapes_script_like_profile_name(
    client: TestClient,
    monkeypatch,
) -> None:
    headers = register_and_login(client, "react-profile-escaping@example.com")
    name = '</script><script>alert("x")</script>'
    updated = client.patch("/auth/me", headers=headers, json={"first_name": name})
    assert updated.status_code == 200
    monkeypatch.setattr(
        "app.routers.ui.profile.react_assets",
        lambda entry: {
            "react_script": "/static/react/assets/profile-test.js",
            "react_styles": [],
        },
    )

    response = client.get("/ui/profile", headers=headers)

    assert response.status_code == 200
    boot = _boot_data(response.text)
    assert boot["firstName"] == name
    assert boot["profile"]["first_name"] == name
    assert name not in response.text
    assert "<script>alert" not in response.text


def test_profile_preview_is_a_hidden_redirect_to_the_canonical_react_page(
    client: TestClient,
) -> None:
    headers = register_and_login(client, "react-profile-alias@example.com")

    response = client.get("/ui/profile/preview?edit=1", headers=headers, follow_redirects=False)

    assert response.status_code == 308
    assert response.headers["location"] == "/ui/profile?edit=1"
    assert 'id="page-data"' not in response.text
    assert "/ui/profile/preview" not in client.get("/openapi.json").json()["paths"]
