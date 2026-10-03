"""Project paths shared by local runs and the application container."""

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent
FRONTEND_DIST_DIR = PROJECT_DIR / "frontend" / "dist"
