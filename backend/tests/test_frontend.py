import json

import pytest
from fastapi import HTTPException

from app.web import frontend


def test_preview_assets_resolve_local_vite_manifest(monkeypatch, tmp_path) -> None:
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "_shared.js": {
                    "file": "assets/shared-test.js",
                    "css": ["assets/shared-test.css"],
                },
                "src/entries/overview-main.tsx": {
                    "file": "assets/main-test.js",
                    "imports": ["_shared.js"],
                },
                "src/entries/calendar-main.tsx": {
                    "file": "assets/calendar-test.js",
                    "imports": ["_shared.js"],
                    "css": ["assets/calendar-test.css"],
                },
                "src/entries/tasks-main.tsx": {
                    "file": "assets/tasks-test.js",
                    "imports": ["_shared.js"],
                    "css": ["assets/tasks-test.css"],
                },
                "src/entries/task-editor-main.tsx": {
                    "file": "assets/task-editor-test.js",
                    "imports": ["_shared.js"],
                    "css": ["assets/task-editor-test.css"],
                },
                "src/entries/profile-main.tsx": {
                    "file": "assets/profile-test.js",
                    "imports": ["_shared.js"],
                    "css": ["assets/profile-test.css"],
                },
                "src/entries/auth-main.tsx": {
                    "file": "assets/auth-test.js",
                    "imports": ["_shared.js"],
                    "css": ["assets/auth-test.css"],
                },
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(frontend, "MANIFEST", manifest)

    assert frontend.preview_assets() == {
        "preview_script": "/static/react/assets/main-test.js",
        "preview_styles": ["/static/react/assets/shared-test.css"],
    }
    assert frontend.preview_assets("src/entries/calendar-main.tsx") == {
        "preview_script": "/static/react/assets/calendar-test.js",
        "preview_styles": [
            "/static/react/assets/shared-test.css",
            "/static/react/assets/calendar-test.css",
        ],
    }
    assert frontend.preview_assets("src/entries/tasks-main.tsx") == {
        "preview_script": "/static/react/assets/tasks-test.js",
        "preview_styles": [
            "/static/react/assets/shared-test.css",
            "/static/react/assets/tasks-test.css",
        ],
    }
    assert frontend.preview_assets("src/entries/task-editor-main.tsx") == {
        "preview_script": "/static/react/assets/task-editor-test.js",
        "preview_styles": [
            "/static/react/assets/shared-test.css",
            "/static/react/assets/task-editor-test.css",
        ],
    }
    assert frontend.preview_assets("src/entries/profile-main.tsx") == {
        "preview_script": "/static/react/assets/profile-test.js",
        "preview_styles": [
            "/static/react/assets/shared-test.css",
            "/static/react/assets/profile-test.css",
        ],
    }
    assert frontend.preview_assets("src/entries/auth-main.tsx") == {
        "preview_script": "/static/react/assets/auth-test.js",
        "preview_styles": [
            "/static/react/assets/shared-test.css",
            "/static/react/assets/auth-test.css",
        ],
    }


def test_preview_assets_explain_missing_build(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(frontend, "MANIFEST", tmp_path / "missing.json")

    with pytest.raises(HTTPException) as error:
        frontend.preview_assets()

    assert error.value.status_code == 503
