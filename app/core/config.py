from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки из окружения / .env (расширение при подключении БД и JWT)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://user:password@localhost:15432/student_tasks"
    secret_key: str = "change-me-in-development"
    access_token_expire_minutes: int = 60


settings = Settings()
