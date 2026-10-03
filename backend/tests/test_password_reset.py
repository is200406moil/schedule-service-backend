import hashlib
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from threading import Barrier
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from joserfc import jwt
from joserfc.jwk import OctKey
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.mail import get_mail_sender
from app.core.rate_limit import (
    recovery_address_limiter,
    recovery_confirm_limiter,
    recovery_request_limiter,
    verification_address_limiter,
    verification_confirm_limiter,
    verification_request_limiter,
)
from app.core.security import hash_password, verify_password
from app.main import app
from app.models import PasswordResetToken, User
from app.services import auth_service, password_reset_service
from tests.public_helpers import public_boot

OLD_PASSWORD = "original-private-password"
NEW_PASSWORD = "replacement-private-password"
FIXED_NOW = datetime(2026, 10, 3, 9, 0, tzinfo=UTC)


class CapturingMailSender:
    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.messages.append(message)

    def link(self, index: int = -1) -> str:
        message = self.messages[index]
        body = message.get_body(preferencelist=("plain",)) or message
        match = re.search(r"https?://[^\s<>]+", body.get_content())
        assert match is not None
        return match.group(0)

    def token(self, index: int = -1) -> str:
        return parse_qs(urlsplit(self.link(index)).fragment)["token"][0]


@pytest.fixture()
def recovery_mail(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> CapturingMailSender:
    sender = CapturingMailSender()
    monkeypatch.setattr(settings, "mail_mode", "local")
    monkeypatch.setattr(settings, "public_base_url", "http://127.0.0.1:8000")
    monkeypatch.setattr(password_reset_service, "utc_now", lambda: FIXED_NOW)
    register_user = auth_service.register_user

    def register_verified_user(db: Session, data: auth_service.RegistrationData) -> User:
        # Recovery tests exercise accounts that had already confirmed their address.
        user = register_user(db, data)
        user.email_verified_at = FIXED_NOW
        db.commit()
        db.refresh(user)
        return user

    monkeypatch.setattr(auth_service, "register_user", register_verified_user)
    limiters = (
        recovery_request_limiter,
        recovery_address_limiter,
        recovery_confirm_limiter,
        verification_request_limiter,
        verification_address_limiter,
        verification_confirm_limiter,
    )
    for limiter in limiters:
        limiter.clear()
    app.dependency_overrides[get_mail_sender] = lambda: sender
    try:
        yield sender
    finally:
        app.dependency_overrides.pop(get_mail_sender, None)
        for limiter in limiters:
            limiter.clear()


def register_account(client: TestClient, email: str = "recover@example.com") -> dict:
    response = client.post("/auth/register", json={"email": email, "password": OLD_PASSWORD})
    assert response.status_code == 201
    return response.json()


def request_reset(client: TestClient, email: str = "recover@example.com"):
    return client.post("/auth/password-reset/request", json={"email": email})


def confirm_reset(client: TestClient, token: str, password: str = NEW_PASSWORD):
    return client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "password": password, "password_confirm": password},
    )


def test_recovery_request_hides_account_status_and_sends_only_to_active_user(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    database_session_factory: sessionmaker[Session],
) -> None:
    register_account(client)
    register_account(client, "inactive-recovery@example.com")
    with database_session_factory() as db:
        inactive = db.scalar(select(User).where(User.email == "inactive-recovery@example.com"))
        assert inactive is not None
        inactive.is_active = False
        db.commit()

    known = request_reset(client, "  ReCoVeR@Example.com  ")
    unknown = request_reset(client, "unregistered@example.com")
    inactive_response = request_reset(client, "inactive-recovery@example.com")

    assert known.status_code == unknown.status_code == inactive_response.status_code == 202
    assert known.json() == unknown.json() == inactive_response.json() == {"detail": "requested"}
    assert len(recovery_mail.messages) == 1
    assert str(recovery_mail.messages[0]["To"]) == "recover@example.com"
    assert OLD_PASSWORD not in recovery_mail.messages[0].as_string()
    assert known.headers["cache-control"] == "no-store"
    assert known.headers["referrer-policy"] == "no-referrer"


def test_recovery_link_uses_configured_origin_and_fragment_without_storing_raw_token(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    database_session_factory: sessionmaker[Session],
) -> None:
    register_account(client)
    response = request_reset(client)
    assert response.status_code == 202
    link = urlsplit(recovery_mail.link())
    token = recovery_mail.token()
    assert (link.scheme, link.netloc, link.path) == ("http", "127.0.0.1:8000", "/ui/password-reset")
    assert link.query == ""
    assert set(parse_qs(link.fragment)) == {"token"}
    assert len(token) >= 43
    assert token not in response.text
    with database_session_factory() as db:
        records = db.scalars(select(PasswordResetToken)).all()
        assert len(records) == 1
        record = records[0]
        assert record.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert token not in repr(vars(record))
        assert record.used_at is None


def test_successful_reset_is_single_use_and_revokes_bearer_and_web_sessions(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    database_session_factory: sessionmaker[Session],
) -> None:
    user_data = register_account(client)
    login = client.post("/auth/login", json={"email": user_data["email"], "password": OLD_PASSWORD})
    bearer = {"Authorization": f"Bearer {login.json()['access_token']}"}
    client.get("/ui/login")
    assert (
        client.post(
            "/ui/login",
            data={
                "email": user_data["email"],
                "password": OLD_PASSWORD,
                "csrf_token": client.cookies.get("csrf_token"),
            },
            follow_redirects=False,
        ).status_code
        == 303
    )
    old_cookie = client.cookies.get("access_token")
    assert old_cookie
    assert client.get("/auth/me", headers=bearer).status_code == 200

    assert request_reset(client).status_code == 202
    first_token = recovery_mail.token()
    assert request_reset(client).status_code == 202
    second_token = recovery_mail.token()
    assert first_token != second_token

    confirmed = confirm_reset(client, first_token)
    assert confirmed.status_code == 200
    assert confirmed.json() == {"detail": "password-reset"}
    assert client.cookies.get("access_token") is None
    assert client.get("/auth/me", headers=bearer).status_code == 401
    client.cookies.set("access_token", old_cookie)
    protected = client.get("/ui/profile", follow_redirects=False)
    assert protected.status_code == 303
    assert protected.headers["location"] == "/ui/login"
    client.cookies.clear()

    for token in (first_token, second_token):
        replay = confirm_reset(client, token, "must-never-be-the-password")
        assert replay.status_code == 400
        assert replay.json() == {"detail": "token"}
        assert token not in replay.text
    assert (
        client.post(
            "/auth/login", json={"email": user_data["email"], "password": OLD_PASSWORD}
        ).status_code
        == 401
    )
    new_login = client.post(
        "/auth/login", json={"email": user_data["email"], "password": NEW_PASSWORD}
    )
    assert new_login.status_code == 200
    assert (
        client.get(
            "/auth/me", headers={"Authorization": f"Bearer {new_login.json()['access_token']}"}
        ).status_code
        == 200
    )
    with database_session_factory() as db:
        user = db.get(User, user_data["id"])
        assert user is not None
        assert user.auth_version == 1
        assert verify_password(NEW_PASSWORD, user.password_hash)


def test_reset_get_is_private_does_not_consume_token_and_never_boots_query_secret(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    database_session_factory: sessionmaker[Session],
) -> None:
    register_account(client)
    assert request_reset(client).status_code == 202
    token = recovery_mail.token()
    for path in ("/ui/forgot-password", "/ui/password-reset", f"/ui/password-reset?token={token}"):
        page = client.get(path)
        assert page.status_code == 200
        assert page.headers["cache-control"] == "no-store"
        assert page.headers["referrer-policy"] == "no-referrer"
        assert token not in page.text
        assert "token" not in public_boot(page)
        assert public_boot(page)["csrfToken"] == client.cookies.get("csrf_token")
    with database_session_factory() as db:
        record = db.scalar(select(PasswordResetToken))
        assert record is not None
        assert record.used_at is None
    assert confirm_reset(client, token).status_code == 200


def test_expired_token_is_rejected_at_the_exact_expiry_boundary(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_account(client)
    assert request_reset(client).status_code == 202
    token = recovery_mail.token()
    monkeypatch.setattr(
        password_reset_service,
        "utc_now",
        lambda: FIXED_NOW + password_reset_service.RESET_TOKEN_LIFETIME,
    )
    response = confirm_reset(client, token)
    assert response.status_code == 400
    assert response.json() == {"detail": "token"}
    assert token not in response.text
    assert (
        client.post(
            "/auth/login", json={"email": "recover@example.com", "password": OLD_PASSWORD}
        ).status_code
        == 200
    )


def test_account_deactivation_after_request_prevents_confirmation(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    database_session_factory: sessionmaker[Session],
) -> None:
    register_account(client)
    assert request_reset(client).status_code == 202
    with database_session_factory() as db:
        user = db.scalar(select(User))
        assert user is not None
        user.is_active = False
        db.commit()
    response = confirm_reset(client, recovery_mail.token())
    assert response.status_code == 400
    with database_session_factory() as db:
        user = db.scalar(select(User))
        assert user is not None
        assert user.auth_version == 0
        assert verify_password(OLD_PASSWORD, user.password_hash)


def test_expiration_during_password_hashing_cannot_change_password(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_account(client)
    assert request_reset(client).status_code == 202
    clock = [FIXED_NOW]
    monkeypatch.setattr(password_reset_service, "utc_now", lambda: clock[0])

    def hash_after_expiration(password: str) -> str:
        clock[0] += password_reset_service.RESET_TOKEN_LIFETIME
        return hash_password(password)

    monkeypatch.setattr(password_reset_service, "hash_password", hash_after_expiration)
    response = confirm_reset(client, recovery_mail.token())
    assert response.status_code == 400
    with database_session_factory() as db:
        user = db.scalar(select(User))
        assert user is not None
        assert user.auth_version == 0
        assert verify_password(OLD_PASSWORD, user.password_hash)


@pytest.mark.parametrize("token", ["", "short", "x" * 42, "!" * 43, "x" * 1000])
def test_malformed_tokens_are_generic_and_do_not_echo_secrets(
    client: TestClient, recovery_mail: CapturingMailSender, token: str
) -> None:
    response = confirm_reset(client, token)
    assert response.status_code in {400, 422}
    if token:
        assert token not in response.text
    assert NEW_PASSWORD not in response.text


@pytest.mark.parametrize("channel", ["api", "web"])
@pytest.mark.parametrize("length", [7, 8, 65, 128, 129])
def test_reset_password_bounds_count_unicode_points(
    client: TestClient, recovery_mail: CapturingMailSender, channel: str, length: int
) -> None:
    register_account(client)
    assert request_reset(client).status_code == 202
    token = recovery_mail.token()
    password = "😀" * length
    if channel == "api":
        response = confirm_reset(client, token, password)
    else:
        client.get("/ui/password-reset")
        response = client.post(
            "/ui/password-reset",
            data={
                "token": token,
                "password": password,
                "password_confirm": password,
                "csrf_token": client.cookies.get("csrf_token"),
            },
            follow_redirects=False,
        )
    if 8 <= length <= 128:
        assert response.status_code == (200 if channel == "api" else 303)
        assert (
            client.post(
                "/auth/login", json={"email": "recover@example.com", "password": password}
            ).status_code
            == 200
        )
    else:
        assert response.status_code == 422
        assert password not in response.text
        assert token not in response.text
        assert confirm_reset(client, token).status_code == 200


@pytest.mark.parametrize("channel", ["api", "web"])
def test_password_confirmation_mismatch_does_not_consume_token(
    client: TestClient, recovery_mail: CapturingMailSender, channel: str
) -> None:
    register_account(client)
    assert request_reset(client).status_code == 202
    token = recovery_mail.token()
    payload = {
        "token": token,
        "password": NEW_PASSWORD,
        "password_confirm": "different-private-password",
    }
    if channel == "api":
        response = client.post("/auth/password-reset/confirm", json=payload)
        assert response.json() == {"detail": "mismatch"}
    else:
        client.get("/ui/password-reset")
        response = client.post(
            "/ui/password-reset",
            data={**payload, "csrf_token": client.cookies.get("csrf_token")},
        )
        assert public_boot(response)["error"] == "mismatch"
    assert response.status_code == 422
    for secret in payload.values():
        assert secret not in response.text
    assert confirm_reset(client, token).status_code == 200


@pytest.mark.parametrize("page", ["forgot-password", "password-reset"])
@pytest.mark.parametrize("submitted_csrf", [None, "forged-token"])
def test_recovery_web_forms_require_csrf_and_redact_sensitive_values(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    page: str,
    submitted_csrf: str | None,
) -> None:
    register_account(client)
    assert request_reset(client).status_code == 202
    token = recovery_mail.token()
    client.get(f"/ui/{page}")
    payload = {
        "email": "recover@example.com",
        "token": token,
        "password": NEW_PASSWORD,
        "password_confirm": NEW_PASSWORD,
    }
    if submitted_csrf is not None:
        payload["csrf_token"] = submitted_csrf
    response = client.post(f"/ui/{page}", data=payload, follow_redirects=False)
    assert response.status_code == 403
    assert public_boot(response)["error"] == "csrf"
    assert token not in response.text
    assert NEW_PASSWORD not in response.text
    assert len(recovery_mail.messages) == 1
    assert confirm_reset(client, token).status_code == 200


def test_recovery_web_request_has_same_result_for_known_and_unknown_email(
    client: TestClient, recovery_mail: CapturingMailSender
) -> None:
    register_account(client)
    client.get("/ui/forgot-password")
    csrf = client.cookies.get("csrf_token")
    responses = [
        client.post(
            "/ui/forgot-password",
            data={"email": email, "csrf_token": csrf},
            follow_redirects=False,
        )
        for email in ("recover@example.com", "unknown-recovery@example.com")
    ]
    assert responses[0].status_code == responses[1].status_code
    if responses[0].is_redirect:
        assert responses[0].headers["location"] == responses[1].headers["location"]
    else:
        assert public_boot(responses[0])["ok"] == public_boot(responses[1])["ok"]
        assert public_boot(responses[0])["error"] == public_boot(responses[1])["error"]
    assert len(recovery_mail.messages) == 1


@pytest.mark.parametrize("channel", ["api", "web"])
def test_disabled_recovery_is_uniform_and_does_not_create_tokens(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
    channel: str,
) -> None:
    register_account(client)
    monkeypatch.setattr(settings, "mail_mode", "disabled")
    client.get("/ui/forgot-password")
    csrf = client.cookies.get("csrf_token")
    responses = []
    for email in ("recover@example.com", "unknown-disabled@example.com"):
        if channel == "api":
            response = request_reset(client, email)
        else:
            response = client.post(
                "/ui/forgot-password",
                data={"email": email, "csrf_token": csrf},
            )
        responses.append(response)
    assert responses[0].status_code == responses[1].status_code == 503
    if channel == "api":
        assert responses[0].json() == responses[1].json() == {"detail": "unavailable"}
    else:
        assert (
            public_boot(responses[0])["error"]
            == public_boot(responses[1])["error"]
            == "unavailable"
        )
    assert recovery_mail.messages == []
    with database_session_factory() as db:
        assert db.scalar(select(PasswordResetToken)) is None


@pytest.mark.parametrize("field", ["token", "password", "password_confirm"])
def test_api_validation_never_echoes_reset_credentials(
    client: TestClient, recovery_mail: CapturingMailSender, field: str
) -> None:
    secret = "private-reset-value-that-must-not-be-echoed"
    payload = {"token": "x" * 43, "password": NEW_PASSWORD, "password_confirm": NEW_PASSWORD}
    payload[field] = {"private": secret}
    response = client.post("/auth/password-reset/confirm", json=payload)
    assert response.status_code == 422
    assert secret not in response.text
    assert NEW_PASSWORD not in response.text
    assert '"input"' not in response.text


@pytest.mark.parametrize("field", ["token", "password", "password_confirm"])
def test_web_multipart_validation_never_echoes_reset_credentials(
    client: TestClient, recovery_mail: CapturingMailSender, field: str
) -> None:
    client.get("/ui/password-reset")
    secret = "private-secret-in-upload-filename-and-content"
    payload = {
        "token": "private-token-" + "x" * 43,
        "password": NEW_PASSWORD,
        "password_confirm": NEW_PASSWORD,
        "csrf_token": client.cookies.get("csrf_token"),
    }
    payload.pop(field)
    response = client.post(
        "/ui/password-reset",
        data=payload,
        files={field: (secret, secret.encode(), "application/octet-stream")},
    )
    assert response.status_code == 422
    assert secret not in response.text
    assert NEW_PASSWORD not in response.text
    assert payload.get("token", "unused-sentinel") not in response.text
    assert '"input"' not in response.text


def test_request_rate_limit_is_bounded_and_reports_retry_after(
    client: TestClient, recovery_mail: CapturingMailSender
) -> None:
    for index in range(recovery_request_limiter.max_attempts):
        assert request_reset(client, f"unknown-{index}@example.com").status_code == 202
    blocked = request_reset(client, "another-unknown@example.com")
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0
    assert recovery_mail.messages == []


def test_confirmation_rate_limit_applies_to_invalid_tokens(
    client: TestClient, recovery_mail: CapturingMailSender
) -> None:
    for _ in range(recovery_confirm_limiter.max_attempts):
        assert confirm_reset(client, "x" * 43).status_code == 400
    blocked = confirm_reset(client, "x" * 43)
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0


@pytest.mark.parametrize(
    "endpoint,limiter",
    [
        ("request", recovery_request_limiter),
        ("confirm", recovery_confirm_limiter),
    ],
)
def test_malformed_json_counts_toward_recovery_request_limits_and_remains_private(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    endpoint: str,
    limiter,
) -> None:
    secret = "private-credential-in-malformed-json"
    body = f'{{"password":"{secret}","malformed":'
    for _ in range(limiter.max_attempts):
        response = client.post(
            f"/auth/password-reset/{endpoint}",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422
        assert secret not in response.text
    blocked = client.post(
        f"/auth/password-reset/{endpoint}",
        content=body,
        headers={"Content-Type": "application/json"},
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0
    assert secret not in blocked.text
    assert recovery_mail.messages == []


def test_email_address_limit_is_shared_by_web_and_api_and_keeps_generic_success(
    client: TestClient, recovery_mail: CapturingMailSender
) -> None:
    register_account(client)
    client.get("/ui/forgot-password")
    csrf = client.cookies.get("csrf_token")
    for index in range(recovery_address_limiter.max_attempts + 2):
        if index % 2:
            response = client.post(
                "/ui/forgot-password",
                data={"email": " ReCoVeR@Example.com ", "csrf_token": csrf},
                follow_redirects=False,
            )
            assert response.status_code == 303
            assert response.headers["location"] == "/ui/forgot-password?ok=requested"
        else:
            response = request_reset(client)
            assert response.status_code == 202
            assert response.json() == {"detail": "requested"}
    assert len(recovery_mail.messages) == recovery_address_limiter.max_attempts


def test_failed_delivery_keeps_public_success_invalidates_token_and_redacts_logs(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    register_account(client)
    secret = "smtp-credentials-that-must-never-be-logged"

    def fail_delivery(message: EmailMessage) -> None:
        recovery_mail.messages.append(message)
        raise RuntimeError(f"{secret}: {message.as_string()}")

    monkeypatch.setattr(recovery_mail, "send", fail_delivery)
    known = request_reset(client)
    unknown = request_reset(client, "unknown-delivery@example.com")
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json() == {"detail": "requested"}
    token = recovery_mail.token()
    assert confirm_reset(client, token).status_code == 400
    assert secret not in caplog.text
    assert token not in caplog.text
    assert "recover@example.com" not in caplog.text
    assert "Password recovery delivery failed" in caplog.text


def test_failed_change_notification_does_not_undo_successful_reset(
    client: TestClient,
    recovery_mail: CapturingMailSender,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    register_account(client)
    assert request_reset(client).status_code == 202
    token = recovery_mail.token()

    def fail_notification(message: EmailMessage) -> None:
        raise RuntimeError(f"private-smtp-credentials: {message.as_string()}")

    monkeypatch.setattr(recovery_mail, "send", fail_notification)
    assert confirm_reset(client, token).status_code == 200
    assert (
        client.post(
            "/auth/login", json={"email": "recover@example.com", "password": NEW_PASSWORD}
        ).status_code
        == 200
    )
    assert "private-smtp-credentials" not in caplog.text
    assert "recover@example.com" not in caplog.text
    assert "Password change notification delivery failed" in caplog.text


def test_legacy_jwt_without_auth_version_is_rejected_by_both_auth_dependencies(
    client: TestClient, recovery_mail: CapturingMailSender
) -> None:
    user = register_account(client)
    now = datetime.now(UTC)
    token = jwt.encode(
        {"alg": "HS256"},
        {"sub": str(user["id"]), "iat": now, "exp": now + timedelta(minutes=15)},
        OctKey.import_key(settings.secret_key),
        algorithms=["HS256"],
    )
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    client.cookies.set("access_token", token)
    response = client.get("/ui/profile", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/ui/login"


@pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="Concurrent sessions require a dedicated PostgreSQL test database",
)
@pytest.mark.parametrize("same_token", [True, False], ids=["same-token", "different-tokens"])
def test_concurrent_confirmations_change_password_exactly_once(
    database_session_factory: sessionmaker[Session],
    same_token: bool,
) -> None:
    tokens = ("a" * 43, "b" * 43)
    with database_session_factory() as db:
        user = User(email="race-recovery@example.com", password_hash=hash_password(OLD_PASSWORD))
        db.add(user)
        db.flush()
        user_id = user.id
        for token in tokens:
            db.add(
                PasswordResetToken(
                    user_id=user_id,
                    token_hash=hashlib.sha256(token.encode()).hexdigest(),
                    created_at=datetime.now(UTC),
                    expires_at=datetime.now(UTC) + timedelta(minutes=30),
                    auth_version=0,
                )
            )
        db.commit()
    barrier = Barrier(2)

    def worker(index: int) -> bool:
        token = tokens[0] if same_token else tokens[index]
        with database_session_factory() as db:
            barrier.wait(timeout=10)
            try:
                password_reset_service.confirm_password_reset(
                    db, token, f"winning-password-{index}"
                )
            except password_reset_service.InvalidResetTokenError:
                return False
            return True

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(worker, (0, 1)))
    assert sum(results) == 1
    with database_session_factory() as db:
        user = db.get(User, user_id)
        assert user is not None
        assert user.auth_version == 1
        winner = results.index(True)
        assert verify_password(f"winning-password-{winner}", user.password_hash)
        for token in tokens:
            with pytest.raises(password_reset_service.InvalidResetTokenError):
                password_reset_service.confirm_password_reset(db, token, NEW_PASSWORD)
