import hashlib
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.mail import get_mail_sender
from app.core.rate_limit import (
    login_rate_limiter,
    recovery_address_limiter,
    recovery_confirm_limiter,
    recovery_request_limiter,
    verification_address_limiter,
    verification_confirm_limiter,
    verification_request_limiter,
)
from app.core.security import hash_password, verify_password
from app.main import app
from app.models import EmailVerificationToken, PasswordResetToken, User
from app.services import auth_service, email_verification_service, password_reset_service
from tests.public_helpers import public_boot
from tests.test_password_reset import CapturingMailSender

EMAIL = "verify@example.com"
PASSWORD = "verification-private-password"
FIXED_NOW = datetime(2026, 10, 3, 10, 0, tzinfo=UTC)


@pytest.fixture()
def verification_mail(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    sender = CapturingMailSender()
    monkeypatch.setattr(settings, "mail_mode", "local")
    monkeypatch.setattr(settings, "public_base_url", "http://127.0.0.1:8000")
    monkeypatch.setattr(email_verification_service, "utc_now", lambda: FIXED_NOW)
    monkeypatch.setattr(password_reset_service, "utc_now", lambda: FIXED_NOW)
    limiters = (
        verification_request_limiter,
        verification_address_limiter,
        verification_confirm_limiter,
        recovery_request_limiter,
        recovery_address_limiter,
        recovery_confirm_limiter,
    )
    for limiter in limiters:
        limiter.clear()
    login_rate_limiter.reset(f"testclient:{EMAIL}")
    app.dependency_overrides[get_mail_sender] = lambda: sender
    yield sender
    app.dependency_overrides.pop(get_mail_sender, None)
    for limiter in limiters:
        limiter.clear()
    login_rate_limiter.reset(f"testclient:{EMAIL}")


def seed_user(factory: sessionmaker[Session], *, email: str = EMAIL, **values) -> int:
    with factory() as db:
        user = User(email=email, password_hash=hash_password(PASSWORD), **values)
        db.add(user)
        db.commit()
        return user.id


def request_verification(client: TestClient, email: str = EMAIL):
    return client.post("/auth/email-verification/request", json={"email": email})


def confirm(client: TestClient, token: str):
    return client.post("/auth/email-verification/confirm", json={"token": token})


def test_registration_queues_private_verification_link_but_does_not_verify_or_sign_in(
    client, verification_mail, database_session_factory
):
    response = client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 201
    assert response.json()["email_verified"] is False
    assert client.cookies.get("access_token") is None
    assert len(verification_mail.messages) == 1
    token = verification_mail.token()
    assert len(token) == 43
    link = urlsplit(verification_mail.link())
    assert (link.scheme, link.netloc, link.path) == ("http", "127.0.0.1:8000", "/ui/verify-email")
    assert not link.query
    assert set(parse_qs(link.fragment)) == {"token"}
    assert PASSWORD not in verification_mail.messages[0].as_string()
    assert token not in response.text
    with database_session_factory() as db:
        record = db.scalar(select(EmailVerificationToken))
        user = db.scalar(select(User))
        assert record.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert token not in repr(vars(record))
        assert record.email == EMAIL and record.auth_version == 0
        assert record.used_at is None
        assert record.expires_at - record.created_at == timedelta(hours=24)
        assert user.email_verified_at is None


def test_native_registration_redirects_to_verification_without_email_in_url(
    client, verification_mail
):
    client.get("/ui/register")
    response = client.post(
        "/ui/register",
        data={"email": EMAIL, "password": PASSWORD, "csrf_token": client.cookies.get("csrf_token")},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"] == "/ui/email-verification?ok=registered"
    assert client.cookies.get("access_token") is None
    boot = public_boot(client.get(response.headers["location"]))
    assert boot["ok"] == "registered"
    assert boot["verificationRequired"] is True
    assert len(verification_mail.messages) == 1


@pytest.mark.parametrize("mail_mode", ["local", "smtp"])
def test_enabled_mail_requires_verification_and_bad_password_does_not_disclose_status(
    client, verification_mail, database_session_factory, monkeypatch, mail_mode
):
    seed_user(database_session_factory)
    monkeypatch.setattr(settings, "mail_mode", mail_mode)
    bad = client.post("/auth/login", json={"email": EMAIL, "password": "wrong-password"})
    assert bad.status_code == 401
    assert "email-unverified" not in bad.text
    correct = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert correct.status_code == 403
    assert correct.json() == {"detail": "email-unverified"}
    client.get("/ui/login")
    web = client.post(
        "/ui/login",
        data={"email": EMAIL, "password": PASSWORD, "csrf_token": client.cookies.get("csrf_token")},
        follow_redirects=False,
    )
    boot = public_boot(web)
    assert boot["page"] == "email-verification"
    assert boot["error"] == "unverified" and boot["email"] == EMAIL
    assert PASSWORD not in web.text
    assert client.cookies.get("access_token") is None
    assert verification_mail.messages == []


def test_disabled_mail_does_not_invent_verification_and_allows_sign_in(
    client, verification_mail, database_session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "mail_mode", "disabled")
    registered = client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert registered.status_code == 201
    assert registered.json()["email_verified"] is False
    login = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert login.status_code == 200
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert me.status_code == 200 and me.json()["email_verified"] is False
    assert verification_mail.messages == []
    with database_session_factory() as db:
        assert db.scalar(select(User)).email_verified_at is None
        assert db.scalar(select(EmailVerificationToken)) is None


def test_mail_switch_blocks_old_unverified_bearer_and_cookie_sessions(
    client, verification_mail, database_session_factory, monkeypatch
):
    user_id = seed_user(database_session_factory)
    with database_session_factory() as db:
        token = auth_service.create_access_token_for_user(db.get(User, user_id))
    headers = {"Authorization": f"Bearer {token}"}
    monkeypatch.setattr(settings, "mail_mode", "disabled")
    assert client.get("/auth/me", headers=headers).status_code == 200
    client.cookies.set("access_token", token)
    monkeypatch.setattr(settings, "mail_mode", "local")
    assert client.get("/auth/me", headers=headers).status_code in {401, 403}
    page = client.get("/ui/profile", follow_redirects=False)
    assert page.status_code == 303 and page.headers["location"] == "/ui/login"


def test_requests_hide_account_status_and_only_mail_active_unverified_users(
    client, verification_mail, database_session_factory
):
    seed_user(database_session_factory)
    seed_user(database_session_factory, email="inactive@example.com", is_active=False)
    seed_user(database_session_factory, email="verified@example.com", email_verified_at=FIXED_NOW)
    responses = [
        request_verification(client, address)
        for address in (
            "  VeRiFy@Example.com ",
            "unknown@example.com",
            "inactive@example.com",
            "verified@example.com",
        )
    ]
    assert all(response.status_code == 202 for response in responses)
    assert all(response.json() == {"detail": "requested"} for response in responses)
    assert len(verification_mail.messages) == 1
    assert str(verification_mail.messages[0]["To"]) == EMAIL


def test_get_and_query_token_never_confirm_or_disclose_a_link(
    client, verification_mail, database_session_factory
):
    seed_user(database_session_factory)
    request_verification(client)
    token = verification_mail.token()
    for path in ("/ui/email-verification", "/ui/verify-email", f"/ui/verify-email?token={token}"):
        page = client.get(path)
        assert page.status_code == 200
        assert page.headers["cache-control"] == "no-store"
        assert page.headers["referrer-policy"] == "no-referrer"
        assert token not in page.text and "token" not in public_boot(page)
    with database_session_factory() as db:
        assert db.scalar(select(User)).email_verified_at is None
        assert db.scalar(select(EmailVerificationToken)).used_at is None


@pytest.mark.parametrize("channel", ["api", "web"])
def test_confirmation_is_single_use_revokes_old_sessions_and_sibling_links(
    client, verification_mail, database_session_factory, channel
):
    user_id = seed_user(database_session_factory)
    with database_session_factory() as db:
        old_bearer = auth_service.create_access_token_for_user(db.get(User, user_id))
    request_verification(client)
    first = verification_mail.token()
    request_verification(client)
    second = verification_mail.token()
    client.post("/auth/password-reset/request", json={"email": EMAIL})
    reset_token = verification_mail.token()
    client.cookies.set("access_token", old_bearer, domain="testserver.local", path="/")
    if channel == "api":
        response = confirm(client, first)
        assert response.status_code == 200 and response.json() == {"detail": "email-verified"}
    else:
        client.get("/ui/verify-email")
        response = client.post(
            "/ui/verify-email",
            data={"token": first, "csrf_token": client.cookies.get("csrf_token")},
            follow_redirects=False,
        )
        assert response.status_code == 303
        assert response.headers["location"] == "/ui/login?ok=email-verified#"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert client.cookies.get("access_token") is None
    assert (
        client.get("/auth/me", headers={"Authorization": f"Bearer {old_bearer}"}).status_code == 401
    )
    for token in (first, second):
        assert confirm(client, token).status_code == 400
    reset = client.post(
        "/auth/password-reset/confirm",
        json={
            "token": reset_token,
            "password": "replacement-password",
            "password_confirm": "replacement-password",
        },
    )
    assert reset.status_code == 400
    login = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert login.status_code == 200
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert me.status_code == 200 and me.json()["email_verified"] is True
    with database_session_factory() as db:
        user = db.get(User, user_id)
        assert user.email_verified_at is not None and user.auth_version == 1
        assert verify_password(PASSWORD, user.password_hash)


@pytest.mark.parametrize("change", ["inactive", "email", "version"])
def test_changed_account_cannot_be_verified_by_old_link(
    client, verification_mail, database_session_factory, change
):
    user_id = seed_user(database_session_factory)
    request_verification(client)
    with database_session_factory() as db:
        user = db.get(User, user_id)
        if change == "inactive":
            user.is_active = False
        elif change == "email":
            user.email = "changed@example.com"
        else:
            user.auth_version += 1
        db.commit()
    assert confirm(client, verification_mail.token()).status_code == 400
    with database_session_factory() as db:
        assert db.get(User, user_id).email_verified_at is None
        assert db.scalar(select(EmailVerificationToken)).used_at is None


def test_expiry_is_rechecked_after_user_update_and_rolls_it_back(
    client, verification_mail, database_session_factory, monkeypatch
):
    user_id = seed_user(database_session_factory)
    request_verification(client)
    times = iter((FIXED_NOW, FIXED_NOW + timedelta(hours=24)))
    monkeypatch.setattr(email_verification_service, "utc_now", lambda: next(times))
    assert confirm(client, verification_mail.token()).status_code == 400
    with database_session_factory() as db:
        user = db.get(User, user_id)
        assert user.email_verified_at is None and user.auth_version == 0
        assert db.scalar(select(EmailVerificationToken)).used_at is None


def test_expired_link_is_invalid_at_exact_boundary(
    client, verification_mail, database_session_factory, monkeypatch
):
    seed_user(database_session_factory)
    request_verification(client)
    monkeypatch.setattr(
        email_verification_service, "utc_now", lambda: FIXED_NOW + timedelta(hours=24)
    )
    assert confirm(client, verification_mail.token()).status_code == 400


def test_password_reset_does_not_verify_email_and_invalidates_previous_verification(
    client, verification_mail, database_session_factory
):
    user_id = seed_user(database_session_factory)
    request_verification(client)
    old_verification = verification_mail.token()
    client.post("/auth/password-reset/request", json={"email": EMAIL})
    reset_token = verification_mail.token()
    response = client.post(
        "/auth/password-reset/confirm",
        json={
            "token": reset_token,
            "password": "replacement-password",
            "password_confirm": "replacement-password",
        },
    )
    assert response.status_code == 200
    assert confirm(client, old_verification).status_code == 400
    login = client.post("/auth/login", json={"email": EMAIL, "password": "replacement-password"})
    assert login.status_code == 403
    with database_session_factory() as db:
        user = db.get(User, user_id)
        assert user.email_verified_at is None and user.auth_version == 1
    request_verification(client)
    assert confirm(client, verification_mail.token()).status_code == 200


@pytest.mark.parametrize("page", ["email-verification", "verify-email"])
@pytest.mark.parametrize("csrf", [None, "forged"])
def test_native_forms_require_csrf_without_echoing_token(
    client, verification_mail, database_session_factory, page, csrf
):
    seed_user(database_session_factory)
    request_verification(client)
    token = verification_mail.token()
    client.get(f"/ui/{page}")
    payload = {"email": EMAIL, "token": token}
    if csrf is not None:
        payload["csrf_token"] = csrf
    response = client.post(f"/ui/{page}", data=payload)
    assert response.status_code == 403 and public_boot(response)["error"] == "csrf"
    assert token not in response.text
    assert confirm(client, token).status_code == 200


@pytest.mark.parametrize("channel", ["api", "web"])
def test_disabled_request_is_uniform_and_creates_no_links(
    client, verification_mail, database_session_factory, monkeypatch, channel
):
    seed_user(database_session_factory)
    monkeypatch.setattr(settings, "mail_mode", "disabled")
    client.get("/ui/email-verification")
    for address in (EMAIL, "unknown@example.com"):
        if channel == "api":
            response = request_verification(client, address)
            assert response.json() == {"detail": "unavailable"}
        else:
            response = client.post(
                "/ui/email-verification",
                data={"email": address, "csrf_token": client.cookies.get("csrf_token")},
            )
            assert public_boot(response)["error"] == "unavailable"
        assert response.status_code == 503
    assert verification_mail.messages == []
    with database_session_factory() as db:
        assert db.scalar(select(EmailVerificationToken)) is None


@pytest.mark.parametrize(
    "endpoint,limiter",
    [("request", verification_request_limiter), ("confirm", verification_confirm_limiter)],
)
def test_malformed_api_requests_count_towards_limit_and_redact_input(
    client, verification_mail, endpoint, limiter
):
    secret = "private-token-in-broken-json"
    for _ in range(limiter.max_attempts):
        response = client.post(
            f"/auth/email-verification/{endpoint}",
            content=f'{{"token":"{secret}",',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422 and secret not in response.text
        assert '"input"' not in response.text and '"ctx"' not in response.text
    blocked = client.post(f"/auth/email-verification/{endpoint}", json={"token": secret})
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) > 0
    assert secret not in blocked.text
    assert blocked.headers["cache-control"] == "no-store"
    assert blocked.headers["referrer-policy"] == "no-referrer"


@pytest.mark.parametrize("path", ["/auth/register", "/ui/register"])
def test_mail_enabled_registration_shares_request_limit_even_for_invalid_bodies(
    client, verification_mail, path
):
    for _ in range(verification_request_limiter.max_attempts):
        response = client.post(
            path, content='{"secret":', headers={"Content-Type": "application/json"}
        )
        assert response.status_code in {403, 422}
    blocked = request_verification(client, "unknown@example.com")
    assert blocked.status_code == 429


def test_address_limit_is_shared_by_auto_registration_web_and_api(client, verification_mail):
    client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    client.get("/ui/email-verification")
    for index in range(verification_address_limiter.max_attempts + 1):
        if index % 2:
            response = client.post(
                "/ui/email-verification",
                data={
                    "email": " VeRiFy@Example.com ",
                    "csrf_token": client.cookies.get("csrf_token"),
                },
                follow_redirects=False,
            )
            assert response.status_code == 303
        else:
            assert request_verification(client).status_code == 202
    assert len(verification_mail.messages) == verification_address_limiter.max_attempts


@pytest.mark.parametrize(
    "path,field", [("/ui/verify-email", "token"), ("/ui/email-verification", "email")]
)
def test_upload_instead_of_form_field_is_redacted(client, verification_mail, path, field):
    client.get(path)
    secret = "private-upload-content-and-filename"
    response = client.post(
        path,
        data={"csrf_token": client.cookies.get("csrf_token")},
        files={field: (secret, secret.encode(), "application/octet-stream")},
    )
    assert response.status_code == 422 and secret not in response.text
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("token", ["", "short", "x" * 42, "!" * 43, "x" * 1000])
def test_malformed_token_validation_does_not_echo_input(client, verification_mail, token):
    response = confirm(client, token)
    assert response.status_code in {400, 422}
    if token:
        assert token not in response.text


def test_failed_delivery_invalidates_link_without_leaking_transport_details(
    client, verification_mail, database_session_factory, monkeypatch, caplog
):
    seed_user(database_session_factory)
    secret = "private-smtp-credential"

    def fail(message):
        verification_mail.messages.append(message)
        raise RuntimeError(f"{secret}: {message.as_string()}")

    monkeypatch.setattr(verification_mail, "send", fail)
    assert request_verification(client).status_code == 202
    token = verification_mail.token()
    assert confirm(client, token).status_code == 400
    assert secret not in caplog.text and token not in caplog.text and EMAIL not in caplog.text
    assert "Email verification delivery failed" in caplog.text


@pytest.mark.parametrize("channel", ["api", "web"])
def test_issued_link_can_be_confirmed_after_sender_is_disabled(
    client, verification_mail, database_session_factory, monkeypatch, channel
):
    seed_user(database_session_factory)
    request_verification(client)
    token = verification_mail.token()
    monkeypatch.setattr(settings, "mail_mode", "disabled")
    if channel == "api":
        assert confirm(client, token).status_code == 200
    else:
        client.get("/ui/verify-email")
        response = client.post(
            "/ui/verify-email",
            data={"token": token, "csrf_token": client.cookies.get("csrf_token")},
            follow_redirects=False,
        )
        assert response.status_code == 303
        assert response.headers["location"] == "/ui/login?ok=email-verified#"


@pytest.mark.parametrize(
    "path,limiter",
    [
        ("/ui/email-verification", verification_request_limiter),
        ("/ui/verify-email", verification_confirm_limiter),
        ("/ui/register", verification_request_limiter),
    ],
)
def test_native_rate_limit_has_private_boot_and_retry_after(
    client, verification_mail, path, limiter
):
    for _ in range(limiter.max_attempts):
        assert client.post(path, data={}).status_code == 403
    response = client.post(path, data={"token": "must-not-echo"})
    assert response.status_code == 429
    assert public_boot(response)["error"] == "rate"
    assert int(response.headers["retry-after"]) > 0
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "must-not-echo" not in response.text


@pytest.mark.parametrize("path", ["/ui/email-verification", "/ui/verify-email"])
def test_malformed_multipart_returns_native_error_without_parser_details(
    client, verification_mail, path
):
    secret = "private-malformed-body"
    response = client.post(path, content=secret, headers={"Content-Type": "multipart/form-data"})
    assert response.status_code == 400
    assert public_boot(response)["page"] in {"email-verification", "verify-email"}
    assert secret not in response.text and "Missing boundary" not in response.text
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "path,field",
    [
        ("/auth/email-verification/request", "email"),
        ("/auth/email-verification/confirm", "token"),
    ],
)
def test_nested_credentials_and_mounted_routes_remain_redacted(
    client, verification_mail, path, field
):
    secret = "private-nested-credential"
    with TestClient(client.app, root_path="/portal") as mounted:
        response = mounted.post(f"/portal{path}", json={field: {"value": secret}})
    assert response.status_code == 422
    assert secret not in response.text
    assert '"input"' not in response.text and '"ctx"' not in response.text


def test_request_email_validation_and_native_known_unknown_are_generic(
    client, verification_mail, database_session_factory
):
    seed_user(database_session_factory)
    client.get("/ui/email-verification")
    csrf = client.cookies.get("csrf_token")
    bad = client.post("/ui/email-verification", data={"email": "not-an-email", "csrf_token": csrf})
    assert bad.status_code == 422 and public_boot(bad)["error"] == "email"
    responses = [
        client.post(
            "/ui/email-verification",
            data={"email": address, "csrf_token": csrf},
            follow_redirects=False,
        )
        for address in (EMAIL, "unknown@example.com")
    ]
    assert all(response.status_code == 303 for response in responses)
    assert all(
        response.headers["location"] == "/ui/email-verification?ok=requested"
        for response in responses
    )
    assert len(verification_mail.messages) == 1


@pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="Concurrent sessions require a dedicated PostgreSQL test database",
)
@pytest.mark.parametrize("race", ["same-token", "different-tokens", "password-reset"])
def test_concurrent_confirmation_has_exactly_one_winner(database_session_factory, race):
    tokens = ("a" * 43, "b" * 43)
    user_id = seed_user(database_session_factory)
    now = datetime.now(UTC)
    with database_session_factory() as db:
        for token in tokens:
            db.add(
                EmailVerificationToken(
                    user_id=user_id,
                    email=EMAIL,
                    token_hash=hashlib.sha256(token.encode()).hexdigest(),
                    auth_version=0,
                    created_at=now,
                    expires_at=now + timedelta(hours=24),
                )
            )
        if race == "password-reset":
            db.add(
                PasswordResetToken(
                    user_id=user_id,
                    token_hash=hashlib.sha256(tokens[1].encode()).hexdigest(),
                    auth_version=0,
                    created_at=now,
                    expires_at=now + timedelta(minutes=30),
                )
            )
        db.commit()
    barrier = Barrier(2)

    def worker(index):
        with database_session_factory() as db:
            barrier.wait(timeout=10)
            try:
                if race == "password-reset" and index == 1:
                    password_reset_service.confirm_password_reset(
                        db, tokens[1], "race-winner-password"
                    )
                else:
                    token = tokens[0] if race == "same-token" else tokens[index]
                    email_verification_service.confirm_email_verification(db, token)
                return True
            except (
                email_verification_service.InvalidVerificationTokenError,
                password_reset_service.InvalidResetTokenError,
            ):
                return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(worker, (0, 1)))
    assert sum(results) == 1
    with database_session_factory() as db:
        user = db.get(User, user_id)
        assert user.auth_version == 1
        if race == "password-reset" and results[1]:
            assert user.email_verified_at is None
            assert verify_password("race-winner-password", user.password_hash)
        else:
            assert user.email_verified_at is not None
            assert verify_password(PASSWORD, user.password_hash)
