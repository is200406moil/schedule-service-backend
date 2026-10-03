from pathlib import Path

from fastapi.templating import Jinja2Templates

from app.core.config import settings

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
templates.env.globals.update(
    schedule_proxy_base_url="/schedule",
    schedule_api_docs_url=settings.schedule_api_docs_url,
)
