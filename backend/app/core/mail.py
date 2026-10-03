"""Private local outbox and TLS-only SMTP delivery; never log message contents."""

import os
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path
from typing import Protocol
from uuid import uuid4

from app.core.config import Settings, settings
from app.core.paths import PROJECT_DIR

LOCAL_MAIL_DIR = PROJECT_DIR / ".local" / "mail"


class MailSender(Protocol):
    def send(self, message: EmailMessage) -> None: ...


class MailUnavailableError(Exception):
    pass


class DisabledMailSender:
    def send(self, message: EmailMessage) -> None:
        raise MailUnavailableError


class LocalMailSender:
    def __init__(self, directory: Path = LOCAL_MAIL_DIR) -> None:
        self.directory = directory

    def send(self, message: EmailMessage) -> None:
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        path = self.directory / f"{uuid4().hex}.eml"
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as outbox_file:
            outbox_file.write(message.as_bytes())


class SmtpMailSender:
    def __init__(self, configuration: Settings) -> None:
        self.configuration = configuration

    def send(self, message: EmailMessage) -> None:
        configuration = self.configuration
        context = ssl.create_default_context()
        if configuration.smtp_security == "ssl":
            transport = smtplib.SMTP_SSL(
                configuration.smtp_host,
                configuration.smtp_port,
                timeout=configuration.smtp_timeout_seconds,
                context=context,
            )
        else:
            transport = smtplib.SMTP(
                configuration.smtp_host,
                configuration.smtp_port,
                timeout=configuration.smtp_timeout_seconds,
            )
        with transport:
            if configuration.smtp_security == "starttls":
                transport.ehlo()
                transport.starttls(context=context)
                transport.ehlo()
            if configuration.smtp_username and configuration.smtp_password:
                transport.login(
                    configuration.smtp_username,
                    configuration.smtp_password.get_secret_value(),
                )
            transport.send_message(message)


def get_mail_sender() -> MailSender:
    if settings.mail_mode == "local":
        return LocalMailSender()
    if settings.mail_mode == "smtp":
        return SmtpMailSender(settings)
    return DisabledMailSender()
