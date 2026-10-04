import json

from fastapi import HTTPException, status

from app.core.paths import FRONTEND_DIST_DIR

MANIFEST = FRONTEND_DIST_DIR / ".vite" / "manifest.json"


def react_assets(entrypoint: str = "src/entries/overview-main.tsx") -> dict[str, object]:
    """Resolve the self-hosted, content-hashed Vite assets for a React page."""
    try:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        entry = manifest[entrypoint]
        script = entry["file"]
        visited: set[str] = set()
        styles: list[str] = []

        def collect_styles(key: str) -> None:
            if key in visited:
                return
            visited.add(key)
            item = manifest[key]
            for imported in item.get("imports", []):
                collect_styles(imported)
            styles.extend(item.get("css", []))

        collect_styles(entrypoint)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Frontend is not built. Run npm run build in frontend/.",
        ) from exc
    return {
        "react_script": f"/static/react/{script}",
        "react_styles": [f"/static/react/{style}" for style in styles],
    }
