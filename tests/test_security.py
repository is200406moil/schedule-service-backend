from datetime import UTC, datetime, timedelta

import pytest
from joserfc import jwt
from joserfc.jwk import OctKey

from app.core.security import TokenDecodeError, create_access_token, get_token_subject

SECRET_KEY = "test-secret-with-at-least-32-characters"


def test_access_token_round_trip() -> None:
    token = create_access_token(
        subject="42",
        secret_key=SECRET_KEY,
        expires_minutes=15,
    )

    assert get_token_subject(token, SECRET_KEY) == "42"


def test_expired_access_token_is_rejected() -> None:
    token = create_access_token(
        subject="42",
        secret_key=SECRET_KEY,
        expires_minutes=-1,
    )

    with pytest.raises(TokenDecodeError):
        get_token_subject(token, SECRET_KEY)


def test_access_token_with_invalid_signature_is_rejected() -> None:
    token = create_access_token(
        subject="42",
        secret_key=SECRET_KEY,
        expires_minutes=15,
    )
    header, payload, signature = token.split(".")
    replacement = "A" if signature[0] != "A" else "B"
    tampered_token = ".".join((header, payload, replacement + signature[1:]))

    with pytest.raises(TokenDecodeError):
        get_token_subject(tampered_token, SECRET_KEY)


def test_access_token_requires_standard_claims() -> None:
    now = datetime.now(UTC)
    token = jwt.encode(
        {"alg": "HS256"},
        {"sub": "42", "exp": now + timedelta(minutes=15)},
        OctKey.import_key(SECRET_KEY),
        algorithms=["HS256"],
    )

    with pytest.raises(TokenDecodeError):
        get_token_subject(token, SECRET_KEY)
