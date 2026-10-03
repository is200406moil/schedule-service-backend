import ipaddress
from typing import Literal
from urllib.parse import urlsplit

from pydantic import EmailStr, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.paths import PROJECT_DIR

DEVELOPMENT_SECRET = "change-me-in-development"


class Settings(BaseSettings):
    """Настройки приложения, загружаемые из окружения или файла .env."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://user:password@localhost:15432/student_tasks"
    secret_key: str = DEVELOPMENT_SECRET
    access_token_expire_minutes: int = 60
    cookie_secure: bool = False
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 300
    schedule_api_base_url: str = "http://localhost:5000/api/schedule"
    schedule_api_timeout_seconds: float = Field(default=5.0, gt=0, le=30)
    schedule_api_docs_url: str = "http://localhost:5000/docs"
    privacy_operator_name: str = "Гиёсидинов Исмоилходжа Иброхимович"
    privacy_contact_email: EmailStr = "giyesidinov.i.i@edu.mirea.ru"
    public_base_url: str = "http://127.0.0.1:8000"
    mail_mode: Literal["disabled", "local", "smtp"] = "disabled"
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_sender: EmailStr = "noreply@example.com"
    smtp_security: Literal["ssl", "starttls"] = "starttls"
    smtp_timeout_seconds: float = Field(default=10, gt=0, le=15)

    @model_validator(mode="after")
    def validate_mail_settings(self) -> "Settings":
        try:
            base = urlsplit(self.public_base_url)
            hostname = base.hostname
            _ = base.port
        except ValueError as exc:
            raise ValueError("PUBLIC_BASE_URL must be a trusted absolute URL") from exc
        if (
            base.scheme not in {"http", "https"}
            or not hostname
            or base.username is not None
            or base.password is not None
            or base.query
            or base.fragment
            or base.path not in {"", "/"}
            or any(character.isspace() for character in self.public_base_url)
            or "\\" in self.public_base_url
        ):
            raise ValueError("PUBLIC_BASE_URL must be an origin without credentials or suffixes")
        if base.scheme == "http":
            try:
                loopback = ipaddress.ip_address(hostname).is_loopback
            except ValueError:
                loopback = hostname.lower() == "localhost"
            if self.app_environment == "production" or not loopback:
                raise ValueError("PUBLIC_BASE_URL requires HTTPS except for development loopback")
        if self.mail_mode == "local" and self.app_environment == "production":
            raise ValueError("production does not allow MAIL_MODE=local")
        if self.mail_mode == "smtp" and not (self.smtp_host and self.smtp_host.strip()):
            raise ValueError("SMTP_HOST is required for MAIL_MODE=smtp")
        if bool(self.smtp_username) != bool(self.smtp_password):
            raise ValueError("SMTP_USERNAME and SMTP_PASSWORD must be configured together")
        return self

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.app_environment != "production":
            return self
        if self.secret_key == DEVELOPMENT_SECRET or len(self.secret_key.encode()) < 32:
            raise ValueError("production SECRET_KEY must contain at least 32 bytes")
        if not self.cookie_secure:
            raise ValueError("production requires COOKIE_SECURE=true")
        return self


settings = Settings()
