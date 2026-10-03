from fastapi import Request

from app.web.frontend import preview_assets
from app.web.templates import templates


def public_response(request: Request, data: dict, *, title: str, status_code: int = 200):
    """Provide boot data and assets; all public UI belongs to frontend/features/auth."""
    return templates.TemplateResponse(
        request=request,
        name="public.html",
        context={
            "page_title": title,
            "public_data": data,
            **preview_assets("src/entries/auth-main.tsx"),
        },
        status_code=status_code,
        headers={"Cache-Control": "no-store"},
    )
