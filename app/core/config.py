from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения, загружаемые из окружения или файла .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://user:password@localhost:15432/student_tasks"
    secret_key: str = "change-me-in-development"
    access_token_expire_minutes: int = 60
    cookie_secure: bool = False
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 300
    schedule_api_base_url: str = "http://localhost:5000/api/schedule"
    schedule_api_timeout_seconds: float = Field(default=5.0, gt=0, le=30)
    schedule_api_docs_url: str = "http://localhost:5000/docs"


settings = Settings()
