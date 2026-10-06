import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models import User
from app.repositories import user_repository
from tests.public_helpers import public_boot


def test_minimal_web_registration_creates_account_without_profile(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    client.get("/ui/register")
    csrf = client.cookies.get("csrf_token")
    credentials = {"email": "minimal@example.com", "password": "minimal-password-qa"}
    response = client.post(
        "/ui/register", data={**credentials, "csrf_token": csrf}, follow_redirects=False
    )
    assert response.status_code == 303
    with database_session_factory() as db:
        user = user_repository.get_by_email(db, credentials["email"])
        assert user is not None
        for field in (
            "first_name",
            "last_name",
            "patronymic",
            "birth_date",
            "group_name",
            "avatar_base64",
        ):
            assert getattr(user, field) is None
    response = client.post(
        "/ui/login", data={**credentials, "csrf_token": csrf}, follow_redirects=False
    )
    assert response.status_code == 303
    assert client.cookies.get("access_token")
    assert response.headers["location"] == "/ui?choose_group=1"


@pytest.mark.parametrize("group", [None, "ИКБО-14-23"])
def test_login_prompts_only_when_group_is_missing(client: TestClient, group: str | None) -> None:
    credentials = {"email": "group-choice@example.com", "password": "group-choice-password"}
    response = client.post("/auth/register", json={**credentials, "group_name": group})
    assert response.status_code == 201
    client.get("/ui/login")
    csrf = client.cookies.get("csrf_token")
    response = client.post(
        "/ui/login", data={**credentials, "csrf_token": csrf}, follow_redirects=False
    )
    assert response.status_code == 303
    assert response.headers["location"] == ("/ui" if group else "/ui?choose_group=1")
    if group is None:
        saved = client.patch(
            "/auth/me", json={"group_name": "ИКБО-14-23"}, headers={"X-CSRF-Token": csrf}
        )
        assert saved.status_code == 200
        assert saved.json()["group_name"] == "ИКБО-14-23"
        response = client.post(
            "/ui/login", data={**credentials, "csrf_token": csrf}, follow_redirects=False
        )
        assert response.headers["location"] == "/ui"


@pytest.mark.parametrize("page", ["login", "register"])
@pytest.mark.parametrize("failure", ["missing", "forged", "mismatch", "missing-cookie"])
def test_auth_csrf_errors_are_readable_and_never_create_account(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    page: str,
    failure: str,
) -> None:
    client.get(f"/ui/{page}")
    csrf = client.cookies.get("csrf_token")
    data = {"email": "csrf@example.com", "password": "private-qa-password"}
    if failure == "forged":
        data["csrf_token"] = "forged-token"
    elif failure == "mismatch":
        client.cookies.clear()
        client.get(f"/ui/{page}")
        data["csrf_token"] = csrf
    elif failure == "missing-cookie":
        client.cookies.clear()
        data["csrf_token"] = csrf
    response = client.post(f"/ui/{page}", data=data, follow_redirects=False)
    assert response.status_code == 403
    assert public_boot(response)["error"] == "csrf"
    assert public_boot(response)["email"] == "csrf@example.com"
    assert "private-qa-password" not in response.text
    assert not client.cookies.get("access_token")
    with database_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0


@pytest.mark.parametrize("page", ["login", "register"])
def test_password_validation_is_not_mislabeled_as_email(client: TestClient, page: str) -> None:
    client.get(f"/ui/{page}")
    password = "secret-qa-" + "x" * 129
    response = client.post(
        f"/ui/{page}",
        data={
            "email": "valid@example.com",
            "password": password,
            "csrf_token": client.cookies.get("csrf_token"),
        },
    )
    assert response.status_code == 422
    assert public_boot(response)["error"] == "password"
    assert password not in response.text


@pytest.mark.parametrize("page", ["login", "register"])
def test_missing_auth_fields_render_html_errors(client: TestClient, page: str) -> None:
    client.get(f"/ui/{page}")
    response = client.post(f"/ui/{page}", data={"csrf_token": client.cookies.get("csrf_token")})
    assert response.status_code == 422
    assert "text/html" in response.headers["content-type"]
    assert public_boot(response)["error"] == "email"


def test_public_privacy_contains_real_contact_and_cookie_lifetime(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "access_token_expire_minutes", 45)
    response = client.get("/ui/privacy")
    assert response.status_code == 200
    assert public_boot(response) == {
        "page": "privacy",
        "operatorName": "Гиёсидинов Исмоилходжа Иброхимович",
        "contactEmail": "giyesidinov.i.i@edu.mirea.ru",
        "cookieMinutes": 45,
    }


def test_privacy_remains_public_for_signed_in_user(client: TestClient) -> None:
    credentials = {"email": "privacy@example.com", "password": "privacy-qa-password"}
    assert client.post("/auth/register", json=credentials).status_code == 201
    token = client.post("/auth/login", json=credentials).json()["access_token"]
    client.cookies.set("access_token", token)
    assert client.get("/ui/privacy", follow_redirects=False).status_code == 200


def test_auth_email_is_escaped_and_password_not_reflected(client: TestClient) -> None:
    client.get("/ui/register")
    response = client.post(
        "/ui/register",
        data={
            "email": '<script>alert("email")</script>',
            "password": "private-qa-password",
            "csrf_token": client.cookies.get("csrf_token"),
        },
    )
    assert response.status_code == 422
    assert '<script>alert("email")</script>' not in response.text
    assert r"\u003cscript\u003e" in response.text
    assert public_boot(response)["email"] == '<script>alert("email")</script>'
    assert "private-qa-password" not in response.text
