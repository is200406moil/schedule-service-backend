import base64

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models import User
from app.repositories import user_repository
from app.services import auth_service
from tests.public_helpers import public_boot


def test_public_auth_pages_boot_the_frontend_without_profile_fields(client: TestClient) -> None:
    login_response = client.get("/ui/login")
    register_response = client.get("/ui/register")

    assert login_response.status_code == 200
    assert register_response.status_code == 200
    assert public_boot(login_response)["page"] == "login"
    assert public_boot(register_response)["page"] == "register"
    for page in (login_response, register_response):
        assert 'id="root"' in page.text
        assert '<script type="module" src="/static/react/' in page.text
        assert page.headers["cache-control"] == "no-store"
        assert set(public_boot(page)) == {"page", "csrfToken", "email", "error", "ok"}
        assert public_boot(page)["csrfToken"] == client.cookies.get("csrf_token")
        assert "password" not in public_boot(page)


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


@pytest.mark.parametrize("channel", ["api", "web"])
@pytest.mark.parametrize("length", [4, 8, 65, 128, 129])
def test_password_bounds_count_unicode_code_points(
    client: TestClient, channel: str, length: int
) -> None:
    credentials = {"email": "unicode-password@example.com", "password": "😀" * length}
    if channel == "web":
        client.get("/ui/register")
        credentials["csrf_token"] = client.cookies.get("csrf_token")
        response = client.post("/ui/register", data=credentials, follow_redirects=False)
    else:
        response = client.post("/auth/register", json=credentials)

    if not 8 <= length <= 128:
        assert response.status_code == 422
        if channel == "web":
            assert public_boot(response)["error"] == "password"
        assert credentials["password"] not in response.text
        return

    if channel == "web":
        assert response.status_code == 303
        login = client.post("/ui/login", data=credentials, follow_redirects=False)
        assert login.status_code == 303
        assert login.headers["location"] == "/ui"
        assert client.cookies.get("access_token")
    else:
        assert response.status_code == 201
        assert client.post("/auth/login", json=credentials).status_code == 200


@pytest.mark.parametrize("channel", ["api", "web"])
@pytest.mark.parametrize("email", ["почта@example.com", "student@пример.рф"])
def test_unicode_email_is_accepted_by_both_auth_channels(
    client: TestClient, channel: str, email: str
) -> None:
    credentials = {"email": email, "password": "strong-password"}
    if channel == "web":
        client.get("/ui/register")
        credentials["csrf_token"] = client.cookies.get("csrf_token")
        response = client.post("/ui/register", data=credentials, follow_redirects=False)
        assert response.status_code == 303
        login = client.post("/ui/login", data=credentials, follow_redirects=False)
        assert login.status_code == 303
        assert client.cookies.get("access_token")
    else:
        response = client.post("/auth/register", json=credentials)
        assert response.status_code == 201
        assert response.json()["email"] == email
        assert client.post("/auth/login", json=credentials).status_code == 200


def test_html_forms_require_a_valid_csrf_token(client: TestClient) -> None:
    login_page = client.get("/ui/login")
    csrf_token = client.cookies.get("csrf_token")

    assert csrf_token
    assert public_boot(login_page)["csrfToken"] == csrf_token
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
    assert public_boot(accepted)["error"] == "auth"
    assert public_boot(accepted)["email"] == "nobody@example.com"


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
    assert public_boot(invalid_email)["error"] == "email"
    assert public_boot(invalid_email)["email"] == "not-an-email"
    assert "strong-password" not in invalid_email.text

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
    assert public_boot(invalid_date)["error"] == "date"
    assert public_boot(invalid_date)["email"] == "valid@example.com"


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
    assert public_boot(duplicate)["error"] == "exists"
    assert public_boot(duplicate)["email"] == "duplicate@example.com"
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
    assert public_boot(web_response)["error"] == "auth"
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
