import ssl
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from pathlib import Path

import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings, settings
from app.core.mail import (
    LOCAL_MAIL_DIR,
    DisabledMailSender,
    LocalMailSender,
    MailUnavailableError,
    SmtpMailSender,
    get_mail_sender,
)
from app.core.paths import FRONTEND_DIST_DIR, PROJECT_DIR
from app.core.rate_limit import RecoveryRateLimiter


def mail_settings(**overrides) -> Settings:
    values = {
        "app_environment": "test",
        "secret_key": "mail-test-secret-with-at-least-32-characters",
        "cookie_secure": False,
        "mail_mode": "disabled",
        "public_base_url": "http://127.0.0.1:8000",
        "smtp_host": None,
        "smtp_username": None,
        "smtp_password": None,
    }
    return Settings(_env_file=None, **(values | overrides))


def sample_message() -> EmailMessage:
    message = EmailMessage()
    message["From"] = "noreply@example.com"
    message["To"] = "student@example.com"
    message["Subject"] = "Восстановление пароля"
    message.set_content("Личная ссылка: http://127.0.0.1:8000/ui/password-reset#token=private")
    return message


def test_local_sender_writes_unique_readable_eml_files_only_to_private_directory(
    tmp_path: Path,
) -> None:
    directory = tmp_path / "private" / "mail"
    sender = LocalMailSender(directory)
    message = sample_message()
    sender.send(message)
    sender.send(message)
    files = list(directory.glob("*.eml"))
    assert len(files) == 2
    assert files[0].name != files[1].name
    for file in files:
        parsed = BytesParser(policy=policy.default).parsebytes(file.read_bytes())
        assert str(parsed["To"]) == "student@example.com"
        assert str(parsed["Subject"]) == "Восстановление пароля"
        assert "#token=private" in parsed.get_content()
    assert LOCAL_MAIL_DIR == PROJECT_DIR / ".local" / "mail"
    assert not LOCAL_MAIL_DIR.is_relative_to(FRONTEND_DIST_DIR)
    assert not LOCAL_MAIL_DIR.is_relative_to(PROJECT_DIR / "backend" / "app" / "static")


@pytest.mark.parametrize(
    "mode, expected",
    [
        ("disabled", DisabledMailSender),
        ("local", LocalMailSender),
        ("smtp", SmtpMailSender),
    ],
)
def test_mail_sender_dependency_selects_configured_transport(
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    expected: type,
) -> None:
    monkeypatch.setattr(settings, "mail_mode", mode)
    assert isinstance(get_mail_sender(), expected)


def test_disabled_mail_sender_does_not_deliver() -> None:
    with pytest.raises(MailUnavailableError):
        DisabledMailSender().send(sample_message())


@pytest.mark.parametrize("security", ["starttls", "ssl"])
def test_smtp_sender_verifies_tls_and_authenticates_before_delivery(
    monkeypatch: pytest.MonkeyPatch,
    security: str,
) -> None:
    calls: list[tuple] = []
    contexts: list[ssl.SSLContext] = []

    class FakeSmtp:
        def __init__(self, host, port, *, timeout, context=None):
            calls.append(("connect", host, port, timeout))
            if context is not None:
                contexts.append(context)

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            calls.append(("close",))

        def ehlo(self):
            calls.append(("ehlo",))

        def starttls(self, *, context):
            contexts.append(context)
            calls.append(("starttls",))

        def login(self, username, password):
            calls.append(("login", username, password))

        def send_message(self, message):
            calls.append(("send", message))

    monkeypatch.setattr("app.core.mail.smtplib.SMTP", FakeSmtp)
    monkeypatch.setattr("app.core.mail.smtplib.SMTP_SSL", FakeSmtp)
    configuration = mail_settings(
        mail_mode="smtp",
        smtp_host="smtp.example.com",
        smtp_port=465 if security == "ssl" else 587,
        smtp_username="smtp-user",
        smtp_password="private-smtp-secret",
        smtp_security=security,
        smtp_timeout_seconds=7,
    )
    message = sample_message()
    SmtpMailSender(configuration).send(message)
    names = [call[0] for call in calls]
    assert names == (
        ["connect", "ehlo", "starttls", "ehlo", "login", "send", "close"]
        if security == "starttls"
        else ["connect", "login", "send", "close"]
    )
    assert calls[0] == ("connect", "smtp.example.com", configuration.smtp_port, 7)
    assert ("login", "smtp-user", "private-smtp-secret") in calls
    assert ("send", message) in calls
    assert len(contexts) == 1
    assert contexts[0].check_hostname is True
    assert contexts[0].verify_mode == ssl.CERT_REQUIRED


def test_smtp_password_is_a_secret_and_not_exposed_by_settings_repr() -> None:
    configuration = mail_settings(smtp_username="smtp-user", smtp_password="private-smtp-secret")
    assert isinstance(configuration.smtp_password, SecretStr)
    assert configuration.smtp_password.get_secret_value() == "private-smtp-secret"
    assert "private-smtp-secret" not in repr(configuration)
    assert "private-smtp-secret" not in str(configuration.smtp_password)


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "http://127.0.0.1.evil.example",
        "//example.com",
        "ftp://example.com",
        "https://example.com/path",
        "https://example.com?token=private",
        "https://example.com#private",
        "https://username:password@example.com",
        "https://example.com\\evil",
        "https://example.com/ ",
        "https://example.com:invalid",
        "https:///missing-host",
    ],
)
def test_mail_settings_reject_untrusted_or_ambiguous_public_origins(url: str) -> None:
    with pytest.raises(ValidationError):
        mail_settings(public_base_url=url, mail_mode="local")


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://[::1]:8000",
        "https://planner.example.com/",
    ],
)
def test_development_mail_accepts_loopback_http_and_https_origins(url: str) -> None:
    assert mail_settings(public_base_url=url, mail_mode="local").public_base_url == url


@pytest.mark.parametrize(
    "overrides",
    [
        {"mail_mode": "local", "public_base_url": "https://planner.example.com"},
        {
            "mail_mode": "smtp",
            "smtp_host": "smtp.example.com",
            "public_base_url": "http://localhost:8000",
        },
        {
            "mail_mode": "smtp",
            "smtp_host": "smtp.example.com",
            "public_base_url": "http://planner.example.com",
        },
    ],
)
def test_production_rejects_local_delivery_and_insecure_enabled_recovery(overrides: dict) -> None:
    with pytest.raises(ValidationError):
        mail_settings(app_environment="production", cookie_secure=True, **overrides)


def test_production_smtp_requires_a_secure_explicit_public_origin() -> None:
    configuration = mail_settings(
        app_environment="production",
        cookie_secure=True,
        mail_mode="smtp",
        smtp_host="smtp.example.com",
        public_base_url="https://planner.example.com",
    )
    assert configuration.public_base_url == "https://planner.example.com"


@pytest.mark.parametrize(
    "overrides",
    [
        {"mail_mode": "smtp", "smtp_host": None},
        {"mail_mode": "smtp", "smtp_host": "   "},
        {"smtp_username": "user", "smtp_password": None},
        {"smtp_username": None, "smtp_password": "private-smtp-secret"},
        {"smtp_security": "none"},
        {"smtp_security": "plain"},
        {"smtp_timeout_seconds": 0},
        {"smtp_timeout_seconds": 16},
        {"smtp_port": 0},
        {"smtp_port": 65536},
    ],
)
def test_mail_settings_reject_incomplete_authentication_or_unbounded_transport(
    overrides: dict,
) -> None:
    with pytest.raises(ValidationError):
        mail_settings(**overrides)


def test_recovery_limiter_rejects_capacity_flood_without_evicting_existing_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = [10.0]
    monkeypatch.setattr("app.core.rate_limit.time.monotonic", lambda: now[0])
    limiter = RecoveryRateLimiter(max_attempts=1, window_seconds=60, max_tracked_keys=2)
    assert limiter.consume("original") is None
    assert limiter.consume("second") is None
    assert limiter.consume("flood") == 60
    assert limiter.consume("original") == 60
    now[0] = 70.0
    assert limiter.consume("flood") is None
    assert limiter.consume("original") is None
