import pytest
from fastapi.testclient import TestClient


@pytest.mark.parametrize("endpoint", ["/auth/register", "/auth/login"])
@pytest.mark.parametrize(
    "password",
    [
        "private-password-marker-" * 7,
        123456789,
        None,
        {"value": "private-password-marker"},
        ["private-password-marker"],
    ],
)
def test_auth_validation_never_returns_invalid_password_input(
    client: TestClient, endpoint: str, password: object
) -> None:
    response = client.post(
        endpoint,
        json={"email": "validation@example.com", "password": password},
    )

    assert response.status_code == 422
    errors = response.json()["detail"]
    password_error = next(error for error in errors if error["loc"] == ["body", "password"])
    assert "input" not in password_error
    assert password_error["type"]
    assert password_error["msg"]
    assert "private-password-marker" not in response.text
    assert "123456789" not in response.text
    if isinstance(password, str):
        assert password_error["type"] == "string_too_long"
        assert password_error["ctx"] == {"max_length": 128}


def test_registration_validation_never_returns_a_short_password(client: TestClient) -> None:
    password = "s3nt1!"
    response = client.post(
        "/auth/register",
        json={"email": "short-password@example.com", "password": password},
    )

    assert response.status_code == 422
    assert password not in response.text
    assert response.json() == {
        "detail": [
            {
                "type": "string_too_short",
                "loc": ["body", "password"],
                "msg": "String should have at least 8 characters",
                "ctx": {"min_length": 8},
            }
        ]
    }


@pytest.mark.parametrize("endpoint", ["/auth/register", "/auth/login"])
def test_auth_validation_retains_non_password_field_diagnostics(
    client: TestClient, endpoint: str
) -> None:
    password = "private-password-marker"
    response = client.post(endpoint, json={"email": "not-an-email", "password": password})

    assert response.status_code == 422
    assert password not in response.text
    error = response.json()["detail"][0]
    assert error["loc"] == ["body", "email"]
    assert error["input"] == "not-an-email"
    assert error["type"] == "value_error"
    assert error["msg"]
    assert error["ctx"]["reason"]


@pytest.mark.parametrize("endpoint", ["/auth/register", "/auth/login"])
def test_missing_email_error_does_not_echo_the_credentials_object(
    client: TestClient, endpoint: str
) -> None:
    password = "private-password-marker"
    response = client.post(
        endpoint,
        json={"password": password, "metadata": {"Password": password}},
    )

    assert response.status_code == 422
    assert password not in response.text
    assert response.json() == {
        "detail": [{"type": "missing", "loc": ["body", "email"], "msg": "Field required"}]
    }


@pytest.mark.parametrize("endpoint", ["/auth/register", "/auth/login"])
@pytest.mark.parametrize(
    "body",
    [
        '{"email":"validation@example.com","password":"private-password-marker"}',
        [{"email": "validation@example.com", "password": "private-password-marker"}],
        None,
    ],
)
def test_invalid_auth_body_does_not_echo_embedded_passwords(
    client: TestClient, endpoint: str, body: object
) -> None:
    response = client.post(endpoint, json=body)

    assert response.status_code == 422
    assert "private-password-marker" not in response.text
    error = response.json()["detail"][0]
    assert error["loc"] == ["body"]
    assert error["type"]
    assert error["msg"]
    assert "input" not in error


@pytest.mark.parametrize("endpoint", ["/auth/register", "/auth/login"])
@pytest.mark.parametrize("url_prefix", ["", "/portal"])
def test_auth_password_validation_is_private_under_a_root_path(
    client: TestClient, endpoint: str, url_prefix: str
) -> None:
    password = "private-password-marker-" * 7
    with TestClient(client.app, root_path="/portal") as mounted_client:
        response = mounted_client.post(
            f"{url_prefix}{endpoint}",
            json={"email": "validation@example.com", "password": password},
        )

    assert response.status_code == 422
    assert password not in response.text
    assert response.json() == {
        "detail": [
            {
                "type": "string_too_long",
                "loc": ["body", "password"],
                "msg": "String should have at most 128 characters",
                "ctx": {"max_length": 128},
            }
        ]
    }


@pytest.mark.parametrize("endpoint", ["/auth/register", "/auth/login"])
def test_auth_validation_keeps_all_errors_without_password_input(
    client: TestClient, endpoint: str
) -> None:
    response = client.post(
        endpoint,
        json={"email": "not-an-email", "password": "private-password-marker-" * 7},
    )

    assert response.status_code == 422
    assert "private-password-marker" not in response.text
    errors = response.json()["detail"]
    assert [error["loc"] for error in errors] == [["body", "email"], ["body", "password"]]
    assert errors[0]["input"] == "not-an-email"
    assert "input" not in errors[1]


@pytest.mark.parametrize("endpoint", ["/auth/register", "/auth/login"])
def test_malformed_auth_json_preserves_parser_diagnostics_without_credentials(
    client: TestClient, endpoint: str
) -> None:
    body = '{"email":"validation@example.com","password":"private-password-marker"'
    response = client.post(endpoint, content=body, headers={"Content-Type": "application/json"})

    assert response.status_code == 422
    assert "private-password-marker" not in response.text
    error = response.json()["detail"][0]
    assert error["type"] == "json_invalid"
    assert error["loc"] == ["body", len(body)]
    assert error["msg"] == "JSON decode error"
    assert error["ctx"] == {"error": "Expecting ',' delimiter"}
    assert "input" not in error


def test_non_auth_validation_retains_the_standard_fastapi_response(client: TestClient) -> None:
    response = client.get("/schedule/x/full_schedule")

    assert response.status_code == 422
    assert response.json() == {
        "detail": [
            {
                "type": "string_too_short",
                "loc": ["path", "group"],
                "msg": "String should have at least 10 characters",
                "input": "x",
                "ctx": {"min_length": 10},
            }
        ]
    }
