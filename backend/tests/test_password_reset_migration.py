import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from app.core.paths import BACKEND_DIR


def migrate(database_url: str, command: str, revision: str) -> None:
    environment = os.environ.copy()
    environment.update(
        DATABASE_URL=database_url,
        APP_ENVIRONMENT="test",
        SECRET_KEY="migration-test-secret-with-at-least-32-characters",
        MAIL_MODE="disabled",
        PUBLIC_BASE_URL="http://127.0.0.1:8000",
    )
    environment.pop("SMTP_USERNAME", None)
    environment.pop("SMTP_PASSWORD", None)
    result = subprocess.run(
        [sys.executable, "-m", "alembic", command, revision],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_password_recovery_migration_preserves_existing_users_on_round_trip(tmp_path: Path) -> None:
    # Explicitly isolated file: no fixture, environment, or configured application DB is used.
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'migration.sqlite').as_posix()}"
    migrate(database_url, "upgrade", "b41386e20c13")
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users (id, email, password_hash, is_active) "
                    "VALUES (1, 'existing@example.com', 'existing-password-hash', true)"
                )
            )
        migrate(database_url, "upgrade", "0006_password_recovery")
        schema = inspect(engine)
        assert "password_reset_tokens" in schema.get_table_names()
        columns = {column["name"]: column for column in schema.get_columns("password_reset_tokens")}
        assert set(columns) == {
            "id",
            "user_id",
            "token_hash",
            "auth_version",
            "created_at",
            "expires_at",
            "used_at",
        }
        assert columns["used_at"]["nullable"] is True
        assert columns["token_hash"]["nullable"] is False
        assert any(
            index["unique"] and index["column_names"] == ["token_hash"]
            for index in schema.get_indexes("password_reset_tokens")
        )
        with engine.connect() as connection:
            assert (
                connection.execute(text("SELECT auth_version FROM users WHERE id=1")).scalar_one()
                == 0
            )
            assert connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one() == ("0006_password_recovery")
        migrate(database_url, "downgrade", "b41386e20c13")
        assert "password_reset_tokens" not in inspect(engine).get_table_names()
        assert "auth_version" not in {
            column["name"] for column in inspect(engine).get_columns("users")
        }
        migrate(database_url, "upgrade", "0006_password_recovery")
        with engine.connect() as connection:
            row = connection.execute(
                text("SELECT email, password_hash, auth_version FROM users WHERE id=1")
            ).one()
        assert tuple(row) == ("existing@example.com", "existing-password-hash", 0)
    finally:
        engine.dispose()
