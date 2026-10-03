"""Private email ownership links, confirmed once without signing the user in."""

import logging
import secrets
from datetime import timedelta

from fastapi import BackgroundTasks
from sqlalchemy import delete, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.mail import MailSender
from app.core.rate_limit import verification_address_limiter
from app.models import EmailVerificationToken, PasswordResetToken, User
from app.services.auth_service import normalize_email
from app.services.password_reset_service import _aware, _message, token_digest, utc_now

VERIFICATION_TOKEN_LIFETIME = timedelta(hours=24)
logger = logging.getLogger(__name__)


class InvalidVerificationTokenError(Exception):
    pass


def deliver_email_verification(bind: Engine, email: str, sender: MailSender) -> None:
    """Keep account lookup and delivery after the identical public response."""
    with Session(bind=bind) as db:
        try:
            now = utc_now()
            db.execute(
                delete(EmailVerificationToken).where(EmailVerificationToken.expires_at <= now)
            )
            user = db.scalar(
                select(User).where(
                    User.email == email,
                    User.is_active.is_(True),
                    User.email_verified_at.is_(None),
                )
            )
            if user is None:
                db.commit()
                return
            token = secrets.token_urlsafe(32)
            verification = EmailVerificationToken(
                user_id=user.id,
                email=user.email,
                token_hash=token_digest(token),
                auth_version=user.auth_version,
                created_at=now,
                expires_at=now + VERIFICATION_TOKEN_LIFETIME,
            )
            db.add(verification)
            db.commit()
            link = f"{settings.public_base_url.rstrip('/')}/ui/verify-email#token={token}"
            message = _message(
                user.email,
                "Мой семестр — подтверждение почты",
                "Чтобы подтвердить адрес электронной почты в «Мой семестр», откройте ссылку "
                "и нажмите кнопку подтверждения:\n\n"
                f"{link}\n\n"
                "Ссылка действует 24 часа и может быть использована только один раз. "
                "Если вы не создавали аккаунт или не запрашивали письмо, "
                "просто проигнорируйте его.",
            )
            try:
                sender.send(message)
            except Exception:
                # Transport errors can contain message bodies, links, or credentials.
                db.execute(
                    update(EmailVerificationToken)
                    .where(
                        EmailVerificationToken.id == verification.id,
                        EmailVerificationToken.used_at.is_(None),
                    )
                    .values(expires_at=utc_now())
                )
                db.commit()
                logger.warning("Email verification delivery failed")
        except SQLAlchemyError:
            db.rollback()
            logger.warning("Email verification background operation failed")


def queue_email_verification(
    background_tasks: BackgroundTasks, db: Session, email: str, sender: MailSender
) -> None:
    if settings.mail_mode == "disabled":
        return
    normalized_email = normalize_email(email)
    if verification_address_limiter.consume(token_digest(normalized_email)) is not None:
        return
    # A background worker owns its own Session; request sessions may already be closed.
    background_tasks.add_task(deliver_email_verification, db.get_bind(), normalized_email, sender)


def confirm_email_verification(db: Session, token: str) -> str:
    if not token or len(token) > 128:
        raise InvalidVerificationTokenError
    now = utc_now()
    verification = db.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_digest(token)
        )
    )
    if (
        verification is None
        or verification.used_at is not None
        or _aware(verification.expires_at) <= now
    ):
        db.rollback()
        raise InvalidVerificationTokenError
    try:
        # All password/verification claims lock the user first. Captured email and
        # auth_version prevent old links from confirming a changed account or password.
        updated_user = db.execute(
            update(User)
            .where(
                User.id == verification.user_id,
                User.email == verification.email,
                User.is_active.is_(True),
                User.auth_version == verification.auth_version,
                User.email_verified_at.is_(None),
            )
            .values(email_verified_at=now, auth_version=User.auth_version + 1)
            .execution_options(synchronize_session=False)
        )
        if updated_user.rowcount != 1:
            raise InvalidVerificationTokenError
        # Recheck expiry after any wait on the user lock, then claim atomically.
        now = utc_now()
        claimed_token = db.execute(
            update(EmailVerificationToken)
            .where(
                EmailVerificationToken.id == verification.id,
                EmailVerificationToken.used_at.is_(None),
                EmailVerificationToken.expires_at > now,
            )
            .values(used_at=now)
            .execution_options(synchronize_session=False)
        )
        if claimed_token.rowcount != 1:
            raise InvalidVerificationTokenError
        for token_model in (EmailVerificationToken, PasswordResetToken):
            db.execute(
                update(token_model)
                .where(token_model.user_id == verification.user_id, token_model.used_at.is_(None))
                .values(expires_at=now)
                .execution_options(synchronize_session=False)
            )
        email = verification.email
        db.commit()
        return email
    except (InvalidVerificationTokenError, SQLAlchemyError):
        db.rollback()
        raise
