import os

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SECRET_KEY"] = "test-secret-with-at-least-32-characters"
os.environ["APP_ENVIRONMENT"] = "test"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.deps import get_db
from app.main import app


@pytest.fixture()
def database_session_factory() -> sessionmaker[Session]:
    engine_options: dict[str, object] = {}
    if TEST_DATABASE_URL.startswith("sqlite"):
        engine_options = {
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        }
    engine = create_engine(TEST_DATABASE_URL, **engine_options)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)

    yield testing_session

    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def client(
    database_session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> TestClient:

    def public_assets(entrypoint: str) -> dict:
        assert entrypoint == "src/entries/auth-main.tsx"
        return {
            "preview_script": "/static/react/assets/auth-test.js",
            "preview_styles": ["/static/react/assets/auth-test.css"],
        }

    monkeypatch.setattr("app.web.public.preview_assets", public_assets)

    def override_get_db():
        db = database_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
