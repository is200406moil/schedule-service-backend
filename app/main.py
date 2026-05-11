from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.routers import auth, tasks, web

APP_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title="Student tasks & deadlines",
    version="0.1.0",
    description="REST API и минимальный веб-интерфейс (Jinja2): JWT, CRUD задач с due_at.",
)

app.mount("/static", StaticFiles(directory=str(APP_DIR / "static")), name="static")

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(web.router)


@app.get("/", include_in_schema=False)
def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/ui")
