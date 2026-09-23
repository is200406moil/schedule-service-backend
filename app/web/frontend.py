import json
from pathlib import Path

from fastapi import HTTPException, status

MANIFEST = Path(__file__).resolve().parent.parent / "static" / "react" / ".vite" / "manifest.json"


def preview_assets() -> dict[str, object]:
    """Resolve the self-hosted, content-hashed Vite assets for the React preview."""
    try:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        entry = manifest["src/main.tsx"]
        script = entry["file"]
        styles = entry["css"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="React preview is not built. Run npm run build in frontend/.",
        ) from exc
    return {
        "preview_script": f"/static/react/{script}",
        "preview_styles": [f"/static/react/{style}" for style in styles],
    }
