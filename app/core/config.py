from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEVELOPMENT_SECRET = "change-me-in-development"


class Settings(BaseSettings):
    """Настройки приложения, загружаемые из окружения или файла .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
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
