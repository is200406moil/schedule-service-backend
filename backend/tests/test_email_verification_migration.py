from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from tests.test_password_reset_migration import migrate


def test_verification_migration_preserves_existing_user_without_faking_verification(tmp_path: Path):
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'verification.sqlite').as_posix()}"
    migrate(database_url, "upgrade", "0006_password_recovery")
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users (id,email,password_hash,is_active,auth_version) "
                    "VALUES (1,'existing@example.com','existing-hash',true,3)"
                )
            )
        migrate(database_url, "upgrade", "0007_email_verification")
        schema = inspect(engine)
        assert "email_verification_tokens" in schema.get_table_names()
        user_columns = {column["name"]: column for column in schema.get_columns("users")}
        assert user_columns["email_verified_at"]["nullable"] is True
        columns = {
            column["name"]: column for column in schema.get_columns("email_verification_tokens")
        }
        assert set(columns) == {
            "id",
            "user_id",
            "email",
            "token_hash",
            "auth_version",
            "created_at",
            "expires_at",
            "used_at",
        }
        assert any(
            index["unique"] and index["column_names"] == ["token_hash"]
            for index in schema.get_indexes("email_verification_tokens")
        )
        with engine.connect() as connection:
            row = connection.execute(
                text(
                    "SELECT email,password_hash,auth_version,email_verified_at "
                    "FROM users WHERE id=1"
                )
            ).one()
            assert tuple(row) == ("existing@example.com", "existing-hash", 3, None)
        migrate(database_url, "downgrade", "0006_password_recovery")
        assert "email_verification_tokens" not in inspect(engine).get_table_names()
        assert "email_verified_at" not in {
            column["name"] for column in inspect(engine).get_columns("users")
        }
        migrate(database_url, "upgrade", "0007_email_verification")
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT auth_version,email_verified_at FROM users WHERE id=1")
            ).one() == (3, None)
    finally:
        engine.dispose()
