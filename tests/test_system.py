import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import DEVELOPMENT_SECRET, Settings


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


def test_api_documentation_uses_a_scoped_content_security_policy(
    client: TestClient,
) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    policy = response.headers["content-security-policy"]
    assert "https://cdn.jsdelivr.net" in policy
    assert "script-src 'self'" in policy


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
