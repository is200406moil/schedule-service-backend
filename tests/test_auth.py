import base64

from fastapi.testclient import TestClient

from app.core.config import settings


def test_public_auth_pages_render_new_forms(client: TestClient) -> None:
    login_response = client.get("/ui/login")
    register_response = client.get("/ui/register")

    assert login_response.status_code == 200
    assert "Один экран для пар, задач и дедлайнов" in login_response.text
    assert login_response.text.count('class="required-label"') == 2
    assert register_response.status_code == 200
    assert "Обязательны только почта и пароль" in register_response.text
    assert register_response.text.count('class="required-label"') == 2
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
