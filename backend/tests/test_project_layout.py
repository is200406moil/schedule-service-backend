from pathlib import Path

import yaml
from starlette.routing import Mount

from app.core.config import Settings
from app.core.paths import BACKEND_DIR, FRONTEND_DIST_DIR, PROJECT_DIR
from app.main import app
from app.web.frontend import MANIFEST


def test_backend_and_frontend_have_separate_project_directories() -> None:
    assert BACKEND_DIR == Path(__file__).resolve().parents[1]
    assert PROJECT_DIR == BACKEND_DIR.parent
    assert FRONTEND_DIST_DIR == PROJECT_DIR / "frontend" / "dist"
    assert MANIFEST == FRONTEND_DIST_DIR / ".vite" / "manifest.json"


def test_settings_find_root_env_regardless_of_working_directory() -> None:
    assert Settings.model_config["env_file"] == PROJECT_DIR / ".env"
    assert Path(Settings.model_config["env_file"]).is_absolute()


def test_frontend_static_mount_precedes_legacy_static_mount() -> None:
    mounts = [route for route in app.routes if isinstance(route, Mount)]
    assert [route.path for route in mounts] == ["/static/react", "/static"]
    assert Path(mounts[0].app.directory) == FRONTEND_DIST_DIR


def test_compose_schedule_address_does_not_reuse_localhost_setting() -> None:
    compose = yaml.safe_load((PROJECT_DIR / "docker-compose.yml").read_text(encoding="utf-8"))
    environment = compose["services"]["app"]["environment"]
    assert environment["SCHEDULE_API_BASE_URL"] == (
        "${COMPOSE_SCHEDULE_API_BASE_URL:-http://schedule-api:5000/api/schedule}"
    )
