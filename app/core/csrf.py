from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import HTTPException, Request, status

CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"


def issue_csrf_token(secret_key: str) -> str:
    nonce = secrets.token_urlsafe(32)
    signature = hmac.new(
        secret_key.encode("utf-8"),
        nonce.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{nonce}.{signature}"


def is_valid_csrf_token(token: str | None, secret_key: str) -> bool:
    if not token:
        return False
    try:
        nonce, signature = token.rsplit(".", 1)
    except ValueError:
        return False
    if not nonce or len(signature) != 64:
        return False
    expected = hmac.new(
        secret_key.encode("utf-8"),
        nonce.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature, expected)


def validate_csrf_token(request: Request, submitted_token: str | None, secret_key: str) -> None:
    cookie_token = request.cookies.get(CSRF_COOKIE)
    if (
        not is_valid_csrf_token(cookie_token, secret_key)
        or not submitted_token
        or not hmac.compare_digest(cookie_token, submitted_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid CSRF token",
        )
