import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import DEVELOPMENT_SECRET, Settings
from app.core.deps import get_db
from app.main import app


def test_healthcheck(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    policy = response.headers["content-security-policy"]
    assert "default-src 'self'" in policy
    assert "script-src 'self'" in policy
    assert "frame-ancestors 'none'" in policy


def test_readiness_check_confirms_database_connection(client: TestClient) -> None:
    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_readiness_check_reports_database_failure(client: TestClient) -> None:
    original_override = app.dependency_overrides[get_db]

    class UnavailableDatabase:
        def execute(self, _query):
            raise SQLAlchemyError("database unavailable")

    def unavailable_database():
        yield UnavailableDatabase()

    app.dependency_overrides[get_db] = unavailable_database
    try:
        response = client.get("/ready")
    finally:
        app.dependency_overrides[get_db] = original_override

    assert response.status_code == 503
    assert response.json() == {"detail": "Database is unavailable"}


def test_api_documentation_uses_a_scoped_content_security_policy(
    client: TestClient,
) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    policy = response.headers["content-security-policy"]
    directives = {
        tokens[0]: set(tokens[1:])
        for raw_directive in policy.split(";")
        if (tokens := raw_directive.split())
    }
    assert {"'self'", "https://cdn.jsdelivr.net"} <= directives["script-src"]


@pytest.mark.parametrize(
    ("secret_key", "cookie_secure"),
    [
        (DEVELOPMENT_SECRET, True),
        ("short-secret", True),
        ("a-production-secret-with-at-least-32-bytes", False),
    ],
)
def test_production_rejects_insecure_settings(
    secret_key: str,
    cookie_secure: bool,
) -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            app_environment="production",
            secret_key=secret_key,
            cookie_secure=cookie_secure,
        )


def test_production_accepts_explicit_secure_settings() -> None:
    production = Settings(
        _env_file=None,
        app_environment="production",
        secret_key="a-production-secret-with-at-least-32-bytes",
        cookie_secure=True,
    )

    assert production.app_environment == "production"
