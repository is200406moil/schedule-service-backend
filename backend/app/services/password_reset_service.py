"""Password recovery with private hashed tokens and atomic session invalidation."""

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

from fastapi import BackgroundTasks
from sqlalchemy import delete, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.mail import MailSender
from app.core.rate_limit import recovery_address_limiter
from app.core.security import hash_password
from app.models import EmailVerificationToken, PasswordResetToken, User
from app.services.auth_service import normalize_email

RESET_TOKEN_LIFETIME = timedelta(minutes=30)
logger = logging.getLogger(__name__)


class InvalidResetTokenError(Exception):
    pass


def utc_now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _message(email: str, subject: str, body: str) -> EmailMessage:
    message = EmailMessage()
    message["From"] = str(settings.smtp_sender)
    message["To"] = email
    message["Subject"] = subject
    message.set_content(body)
    return message


def deliver_password_reset(bind: Engine, email: str, sender: MailSender) -> None:
    """Run lookup and transport after the identical public response is sent."""
    with Session(bind=bind) as db:
        try:
            now = utc_now()
            # Bound accumulated expired records without retaining recoverable secrets.
            db.execute(delete(PasswordResetToken).where(PasswordResetToken.expires_at <= now))
            user = db.scalar(select(User).where(User.email == email, User.is_active.is_(True)))
            if user is None:
                db.commit()
                return
            token = secrets.token_urlsafe(32)
            reset = PasswordResetToken(
                user_id=user.id,
                token_hash=token_digest(token),
                auth_version=user.auth_version,
                created_at=now,
                expires_at=now + RESET_TOKEN_LIFETIME,
            )
            db.add(reset)
            db.commit()
            link = f"{settings.public_base_url.rstrip('/')}/ui/password-reset#token={token}"
            message = _message(
                user.email,
                "Мой семестр — восстановление пароля",
                "Чтобы задать новый пароль в «Мой семестр», откройте ссылку:\n\n"
                f"{link}\n\n"
                "Ссылка действует 30 минут и может быть использована только один раз. "
                "Если вы не запрашивали восстановление, просто проигнорируйте письмо.",
            )
            try:
                sender.send(message)
            except Exception:
                # Transport exceptions may embed credentials or the complete message.
                db.execute(
                    update(PasswordResetToken)
                    .where(PasswordResetToken.id == reset.id, PasswordResetToken.used_at.is_(None))
                    .values(expires_at=utc_now())
                )
                db.commit()
                logger.warning("Password recovery delivery failed")
        except SQLAlchemyError:
            db.rollback()
            logger.warning("Password recovery background operation failed")


def queue_password_reset(
    background_tasks: BackgroundTasks, db: Session, email: str, sender: MailSender
) -> None:
    normalized_email = normalize_email(email)
    address_key = token_digest(normalized_email)
    if recovery_address_limiter.consume(address_key) is not None:
        return
    bind = db.get_bind()
    # Never share a request-scoped Session with a background worker.
    background_tasks.add_task(deliver_password_reset, bind, normalized_email, sender)


def confirm_password_reset(db: Session, token: str, password: str) -> str:
    if not token or len(token) > 128:
        raise InvalidResetTokenError
    now = utc_now()
    reset = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_digest(token))
    )
    if reset is None or reset.used_at is not None or _aware(reset.expires_at) <= now:
        db.rollback()
        raise InvalidResetTokenError
    password_hash = hash_password(password)
    now = utc_now()
    try:
        # Lock the user first. Both duplicate-token and distinct-token races serialize
        # here; the captured version ensures only one reset can ever win.
        updated_user = db.execute(
            update(User)
            .where(
                User.id == reset.user_id,
                User.is_active.is_(True),
                User.auth_version == reset.auth_version,
            )
            .values(password_hash=password_hash, auth_version=User.auth_version + 1)
            .execution_options(synchronize_session=False)
        )
        if updated_user.rowcount != 1:
            raise InvalidResetTokenError
        now = utc_now()
        claimed_token = db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.id == reset.id,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
            )
            .values(used_at=now)
            .execution_options(synchronize_session=False)
        )
        if claimed_token.rowcount != 1:
            raise InvalidResetTokenError
        db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.user_id == reset.user_id,
                PasswordResetToken.used_at.is_(None),
            )
            .values(expires_at=now)
            .execution_options(synchronize_session=False)
        )
        db.execute(
            update(EmailVerificationToken)
            .where(
                EmailVerificationToken.user_id == reset.user_id,
                EmailVerificationToken.used_at.is_(None),
            )
            .values(expires_at=now)
            .execution_options(synchronize_session=False)
        )
        email = db.scalar(select(User.email).where(User.id == reset.user_id))
        db.commit()
        return email
    except (InvalidResetTokenError, SQLAlchemyError):
        db.rollback()
        raise


def send_password_changed(email: str, sender: MailSender) -> None:
    if settings.mail_mode == "disabled":
        return
    message = _message(
        email,
        "Мой семестр — пароль изменён",
        "Пароль вашего аккаунта в «Мой семестр» был изменён. Все предыдущие сеансы завершены. "
        "Если вы не меняли пароль, немедленно запросите восстановление пароля.",
    )
    try:
        sender.send(message)
    except Exception:
        # Password update has already committed; notification failure cannot undo it.
        logger.warning("Password change notification delivery failed")
