from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.csrf import CSRF_COOKIE, is_valid_csrf_token, issue_csrf_token
from app.routers import auth, tasks, ui

APP_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title="Student tasks & deadlines",
    version="0.1.0",
    description="REST API и минимальный веб-интерфейс (Jinja2): JWT, CRUD задач с due_at.",
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    token = request.cookies.get(CSRF_COOKIE)
    should_set_cookie = not is_valid_csrf_token(token, settings.secret_key)
    if should_set_cookie:
        token = issue_csrf_token(settings.secret_key)
    request.state.csrf_token = token
    response = await call_next(request)
    if should_set_cookie:
        response.set_cookie(
            CSRF_COOKIE,
            token,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            max_age=settings.access_token_expire_minutes * 60,
            path="/",
        )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
    )
    response.headers.setdefault(
        "Content-Security-Policy",
        "base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'",
    )
    if settings.cookie_secure:
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
    return response

app.mount("/static", StaticFiles(directory=str(APP_DIR / "static")), name="static")

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(ui.router)


@app.get("/health", tags=["system"])
def healthcheck() -> dict[str, str]:
    """Return a lightweight process health check."""

    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/ui")
