import json

import pytest
from fastapi import HTTPException

from app.web import frontend


def test_preview_assets_resolve_local_vite_manifest(monkeypatch, tmp_path) -> None:
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "src/main.tsx": {
                    "file": "assets/main-test.js",
                    "css": ["assets/main-test.css"],
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(frontend, "MANIFEST", manifest)

    assert frontend.preview_assets() == {
        "preview_script": "/static/react/assets/main-test.js",
        "preview_styles": ["/static/react/assets/main-test.css"],
    }


def test_preview_assets_explain_missing_build(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(frontend, "MANIFEST", tmp_path / "missing.json")

    with pytest.raises(HTTPException) as error:
        frontend.preview_assets()

    assert error.value.status_code == 503
