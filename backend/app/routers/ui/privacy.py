from fastapi import APIRouter, Request

from app.core.config import settings
from app.web.public import public_response

router = APIRouter()


@router.get("/privacy", include_in_schema=False)
def privacy_page(request: Request):
    """Keep the data notice accessible without an account or database lookup."""
    return public_response(
        request,
        {
            "page": "privacy",
            "operatorName": settings.privacy_operator_name,
            "contactEmail": str(settings.privacy_contact_email),
            "cookieMinutes": settings.access_token_expire_minutes,
        },
        title="Политика конфиденциальности",
    )
