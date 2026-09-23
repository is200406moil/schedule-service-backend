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
                "src/main.tsx": {
                    "file": "assets/main-test.js",
                    "imports": ["_shared.js"],
                },
                "src/calendar-main.tsx": {
                    "file": "assets/calendar-test.js",
                    "imports": ["_shared.js"],
                    "css": ["assets/calendar-test.css"],
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
    assert frontend.preview_assets("src/calendar-main.tsx") == {
        "preview_script": "/static/react/assets/calendar-test.js",
        "preview_styles": [
            "/static/react/assets/shared-test.css",
            "/static/react/assets/calendar-test.css",
        ],
    }


def test_preview_assets_explain_missing_build(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(frontend, "MANIFEST", tmp_path / "missing.json")

    with pytest.raises(HTTPException) as error:
        frontend.preview_assets()

    assert error.value.status_code == 503
