from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.csrf import validate_csrf_token
from app.core.deps import ACCESS_TOKEN_COOKIE, get_db
from app.core.mail import MailSender, get_mail_sender
from app.core.rate_limit import (
    get_verification_confirm_retry_after,
    get_verification_request_retry_after,
)
from app.schemas.auth import EmailVerificationRequest
from app.services import email_verification_service
from app.web.public import verification_response

router = APIRouter()


def verification_redirect(location: str) -> RedirectResponse:
    return RedirectResponse(
        url=location,
        status_code=status.HTTP_303_SEE_OTHER,
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@router.get("/email-verification")
def email_verification_page(request: Request):
    ok = request.query_params.get("ok")
    return verification_response(
        request,
        page="email-verification",
        ok=ok if ok in {"requested", "registered"} else None,
    )


@router.post("/email-verification")
def email_verification_submit(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: MailSender = Depends(get_mail_sender),
    retry_after: int | None = Depends(get_verification_request_retry_after),
    email: str = Form(""),
    csrf_token: str | None = Form(None),
):
    submitted_email = email.strip()
    if retry_after is not None:
        return verification_response(
            request,
            page="email-verification",
            error="rate",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            retry_after=retry_after,
        )
    if settings.mail_mode == "disabled":
        return verification_response(
            request,
            page="email-verification",
            error="unavailable",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    try:
        validate_csrf_token(request, csrf_token, settings.secret_key)
    except HTTPException:
        return verification_response(
            request,
            page="email-verification",
            email=submitted_email,
            error="csrf",
            status_code=status.HTTP_403_FORBIDDEN,
        )
    try:
        data = EmailVerificationRequest(email=submitted_email)
    except ValidationError:
        return verification_response(
            request,
            page="email-verification",
            email=submitted_email,
            error="email",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    email_verification_service.queue_email_verification(
        background_tasks, db, str(data.email), sender
    )
    return verification_redirect("/ui/email-verification?ok=requested")


@router.get("/verify-email")
def verify_email_page(request: Request):
    # GET renders an explicit confirmation button; URL fragments never reach the server.
    return verification_response(request, page="verify-email")


@router.post("/verify-email")
def verify_email_submit(
    request: Request,
    db: Session = Depends(get_db),
    retry_after: int | None = Depends(get_verification_confirm_retry_after),
    token: str = Form(""),
    csrf_token: str | None = Form(None),
):
    if retry_after is not None:
        return verification_response(
            request,
            page="verify-email",
            error="rate",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            retry_after=retry_after,
        )
    try:
        validate_csrf_token(request, csrf_token, settings.secret_key)
    except HTTPException:
        return verification_response(
            request,
            page="verify-email",
            error="csrf",
            status_code=status.HTTP_403_FORBIDDEN,
        )
    try:
        email_verification_service.confirm_email_verification(db, token)
    except email_verification_service.InvalidVerificationTokenError:
        return verification_response(
            request,
            page="verify-email",
            error="token",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    # An explicit empty fragment prevents the old bearer secret inheriting onto login.
    response = verification_redirect("/ui/login?ok=email-verified#")
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    return response
