import base64

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models import User
from app.repositories import user_repository
from app.services import auth_service


def test_public_auth_pages_render_new_forms(client: TestClient) -> None:
    login_response = client.get("/ui/login")
    register_response = client.get("/ui/register")

    assert login_response.status_code == 200
    assert "Один экран для пар, задач и дедлайнов" in login_response.text
    assert login_response.text.count('class="required-label"') == 2
    assert 'href="/static/css/auth.css?v=3"' in login_response.text
    assert register_response.status_code == 200
    assert "Обязательны только почта и пароль" in register_response.text
    assert register_response.text.count('class="required-label"') == 2
    assert 'href="/static/css/auth.css?v=3"' in register_response.text
    assert '<script src="/static/autocomplete.js?v=1" defer></script>' in register_response.text
    assert '<script src="/static/auth.js?v=2" defer></script>' in register_response.text


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
    assert accepted.status_code == 401
    assert "Проверьте почту и пароль" in accepted.text
    assert 'value="nobody@example.com"' in accepted.text


def test_web_registration_rejects_invalid_values_without_losing_input(
    client: TestClient,
) -> None:
    client.get("/ui/register")
    csrf_token = client.cookies.get("csrf_token")

    invalid_email = client.post(
        "/ui/register",
        data={
            "email": "not-an-email",
            "password": "strong-password",
            "first_name": "Анна",
            "csrf_token": csrf_token,
        },
    )

    assert invalid_email.status_code == 422
    assert "Введите корректный адрес электронной почты" in invalid_email.text
    assert 'value="not-an-email"' in invalid_email.text
    assert 'value="Анна"' in invalid_email.text

    invalid_date = client.post(
        "/ui/register",
        data={
            "email": "valid@example.com",
            "password": "strong-password",
            "birth_date": "2025-99-99",
            "group_name": "ИКБО-14-23",
            "csrf_token": csrf_token,
        },
    )

    assert invalid_date.status_code == 422
    assert "Проверьте дату рождения" in invalid_date.text
    assert 'value="ИКБО-14-23"' in invalid_date.text


def test_web_registration_duplicate_keeps_non_sensitive_values(
    client: TestClient,
) -> None:
    client.get("/ui/register")
    csrf_token = client.cookies.get("csrf_token")
    form = {
        "email": "duplicate@example.com",
        "password": "strong-password",
        "first_name": "Анна",
        "csrf_token": csrf_token,
    }

    assert client.post("/ui/register", data=form, follow_redirects=False).status_code == 303
    duplicate = client.post("/ui/register", data=form)

    assert duplicate.status_code == 409
    assert "Аккаунт с такой почтой уже существует" in duplicate.text
    assert 'value="duplicate@example.com"' in duplicate.text
    assert 'value="Анна"' in duplicate.text
    assert 'value="strong-password"' not in duplicate.text


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


def test_inactive_account_uses_the_generic_login_error(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
) -> None:
    credentials = {"email": "inactive@example.com", "password": "strong-password"}
    assert client.post("/auth/register", json=credentials).status_code == 201
    with database_session_factory() as db:
        user = user_repository.get_by_email(db, credentials["email"])
        assert user is not None
        user.is_active = False
        db.commit()

    api_response = client.post("/auth/login", json=credentials)
    assert api_response.status_code == 401
    assert api_response.json()["detail"] == "Incorrect email or password"

    client.get("/ui/login")
    web_response = client.post(
        "/ui/login",
        data={**credentials, "csrf_token": client.cookies.get("csrf_token")},
    )
    assert web_response.status_code == 401
    assert "Проверьте почту и пароль" in web_response.text
    assert "учётная запись отключена" not in web_response.text


def test_registration_rolls_back_a_unique_constraint_race(
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registration = auth_service.RegistrationData(
        email="race@example.com",
        password="strong-password",
    )
    with database_session_factory() as db:
        auth_service.register_user(db, registration)
        monkeypatch.setattr(user_repository, "get_by_email", lambda *_: None)

        with pytest.raises(auth_service.EmailAlreadyRegisteredError):
            auth_service.register_user(db, registration)

        assert db.scalar(select(func.count()).select_from(User)) == 1


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
