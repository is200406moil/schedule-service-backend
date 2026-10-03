from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.clients import ScheduleClient
from app.core.config import settings
from app.core.csrf import CSRF_COOKIE, is_valid_csrf_token, issue_csrf_token
from app.core.deps import get_db
from app.core.paths import FRONTEND_DIST_DIR
from app.core.rate_limit import (
    recovery_client_key,
    recovery_confirm_limiter,
    recovery_request_limiter,
    verification_confirm_limiter,
    verification_request_limiter,
)
from app.routers import auth, schedule, tasks, ui
from app.web.public import public_response, recovery_response, verification_response

APP_DIR = Path(__file__).resolve().parent
APP_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "font-src 'self'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'; "
    "form-action 'self'; "
    "object-src 'none'"
)
DOCS_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "connect-src 'self'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'; "
    "form-action 'self'; "
    "object-src 'none'"
)
RECOVERY_REQUEST_ROUTES = {"/auth/password-reset/request", "/ui/forgot-password"}
RECOVERY_CONFIRM_ROUTES = {"/auth/password-reset/confirm", "/ui/password-reset"}
VERIFICATION_REQUEST_ROUTES = {"/auth/email-verification/request", "/ui/email-verification"}
VERIFICATION_CONFIRM_ROUTES = {"/auth/email-verification/confirm", "/ui/verify-email"}
REGISTRATION_ROUTES = {"/auth/register", "/ui/register"}
PRIVATE_UI_AUTH_ROUTES = {
    "/ui/login",
    "/ui/register",
    "/ui/forgot-password",
    "/ui/password-reset",
    "/ui/email-verification",
    "/ui/verify-email",
}


def content_security_policy(path: str) -> str:
    if path in {"/docs", "/redoc", "/docs/oauth2-redirect"}:
        return DOCS_CONTENT_SECURITY_POLICY
    return APP_CONTENT_SECURITY_POLICY


def request_route_path(request: Request) -> str:
    path = request.scope["path"]
    root_path = request.scope.get("root_path", "").rstrip("/")
    if root_path and (path == root_path or path.startswith(f"{root_path}/")):
        return path[len(root_path) :]
    return path


@asynccontextmanager
async def lifespan(application: FastAPI):
    schedule_client = ScheduleClient(
        settings.schedule_api_base_url,
        settings.schedule_api_timeout_seconds,
    )
    application.state.schedule_client = schedule_client
    try:
        yield
    finally:
        await schedule_client.close()


app = FastAPI(
    title="Student tasks & deadlines",
    version="0.1.0",
    description="REST API и веб-приложение для учебного расписания, личных задач и дедлайнов.",
    lifespan=lifespan,
)


@app.exception_handler(StarletteHTTPException)
async def public_http_error_handler(request: Request, exc: StarletteHTTPException):
    route_path = request_route_path(request)
    if route_path in {"/ui/email-verification", "/ui/verify-email"}:
        # Multipart parser failures occur before endpoint/form validation.
        page = "email-verification" if route_path == "/ui/email-verification" else "verify-email"
        error = {
            403: "csrf",
            429: "rate",
            503: "unavailable",
        }.get(exc.status_code, "email" if page == "email-verification" else "token")
        return verification_response(request, page=page, error=error, status_code=exc.status_code)
    return await http_exception_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    route_path = request_route_path(request)
    if route_path in {"/ui/forgot-password", "/ui/password-reset"}:
        page = "forgot-password" if route_path.endswith("/forgot-password") else "password-reset"
        field = str((exc.errors()[0].get("loc") or ("",))[-1])
        error = "email" if page == "forgot-password" else "password"
        if field in {"token", "csrf_token"}:
            error = "token" if field == "token" else "csrf"
        return recovery_response(request, page=page, error=error, status_code=422)
    if route_path in {"/ui/email-verification", "/ui/verify-email"}:
        page = (
            "email-verification" if route_path.endswith("/email-verification") else "verify-email"
        )
        field = str((exc.errors()[0].get("loc") or ("",))[-1])
        error = "email" if page == "email-verification" else "token"
        if field == "csrf_token":
            error = "csrf"
        return verification_response(request, page=page, error=error, status_code=422)
    if route_path in {"/auth/register", "/auth/login"} or route_path.startswith(
        ("/auth/password-reset/", "/auth/email-verification/")
    ):
        # Inputs and validator context can contain passwords, addresses, or link secrets.
        # Preserve only structural diagnostics, including under a mounted root_path.
        errors = [
            {
                "type": error["type"],
                "loc": error["loc"],
                "msg": "Invalid request data",
            }
            for error in exc.errors()
        ]
        exc = RequestValidationError(errors)
    return await request_validation_exception_handler(request, exc)


def rate_limit_response(request: Request, route_path: str, retry_after: int):
    if route_path in {"/ui/email-verification", "/ui/verify-email"}:
        return verification_response(
            request,
            page="email-verification"
            if route_path in VERIFICATION_REQUEST_ROUTES
            else "verify-email",
            error="rate",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            retry_after=retry_after,
        )
    if route_path == "/ui/register":
        response = public_response(
            request,
            {
                "page": "register",
                "csrfToken": request.state.csrf_token,
                "email": "",
                "error": "rate",
                "ok": None,
                "mailMode": settings.mail_mode,
                "verificationRequired": True,
            },
            title="Регистрация",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        )
        response.headers["Retry-After"] = str(retry_after)
        return response
    if route_path.startswith("/ui/"):
        return recovery_response(
            request,
            page="forgot-password" if route_path in RECOVERY_REQUEST_ROUTES else "password-reset",
            error="rate",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            retry_after=retry_after,
        )
    return JSONResponse(
        {"detail": "rate"},
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={"Retry-After": str(retry_after)},
    )


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    token = request.cookies.get(CSRF_COOKIE)
    should_set_cookie = not is_valid_csrf_token(token, settings.secret_key)
    if should_set_cookie:
        token = issue_csrf_token(settings.secret_key)
    request.state.csrf_token = token
    route_path = request_route_path(request)
    retry_after = None
    if request.method == "POST":
        # Count every attempt before form/JSON parsing, including malformed requests.
        if route_path in RECOVERY_REQUEST_ROUTES | RECOVERY_CONFIRM_ROUTES:
            limiter = (
                recovery_request_limiter
                if route_path in RECOVERY_REQUEST_ROUTES
                else recovery_confirm_limiter
            )
            retry_after = limiter.consume(recovery_client_key(request))
            request.state.recovery_retry_after = retry_after
        elif route_path in VERIFICATION_REQUEST_ROUTES | VERIFICATION_CONFIRM_ROUTES or (
            settings.mail_mode != "disabled" and route_path in REGISTRATION_ROUTES
        ):
            limiter = (
                verification_confirm_limiter
                if route_path in VERIFICATION_CONFIRM_ROUTES
                else verification_request_limiter
            )
            retry_after = limiter.consume(recovery_client_key(request))
            request.state.verification_retry_after = retry_after
    if retry_after is not None:
        response = rate_limit_response(request, route_path, retry_after)
    elif (
        request.method == "POST"
        and route_path in VERIFICATION_REQUEST_ROUTES
        and settings.mail_mode == "disabled"
    ):
        # Disabled delivery has one uniform response, even for malformed input.
        if route_path == "/ui/email-verification":
            response = verification_response(
                request,
                page="email-verification",
                error="unavailable",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        else:
            response = JSONResponse(
                {"detail": "unavailable"}, status_code=status.HTTP_503_SERVICE_UNAVAILABLE
            )
    else:
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
    if route_path.startswith("/auth/") or route_path in PRIVATE_UI_AUTH_ROUTES:
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
    )
    response.headers.setdefault(
        "Content-Security-Policy",
        content_security_policy(request.url.path),
    )
    if settings.cookie_secure:
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
    return response


app.mount(
    "/static/react",
    StaticFiles(directory=str(FRONTEND_DIST_DIR), check_dir=False),
    name="frontend",
)
app.mount("/static", StaticFiles(directory=str(APP_DIR / "static")), name="static")

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(schedule.router, prefix="/schedule", tags=["schedule"])
app.include_router(ui.router)


@app.get("/health", tags=["system"])
def healthcheck() -> dict[str, str]:
    """Return a lightweight liveness check for the application process."""

    return {"status": "ok"}


@app.get("/ready", tags=["system"])
def readiness_check(db: Session = Depends(get_db)) -> dict[str, str]:
    """Confirm that the application can serve requests backed by PostgreSQL."""

    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable",
        ) from exc
    return {"status": "ready"}


@app.get("/", include_in_schema=False)
def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/ui")
