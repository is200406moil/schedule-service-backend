from fastapi import APIRouter, Depends, Request

from app.core.deps import get_current_user_optional
from app.models import User
from app.web.forms import canonical_ui_redirect, login_redirect
from app.web.frontend import react_assets
from app.web.presentation import moscow_today
from app.web.templates import templates

router = APIRouter()


@router.get("/calendar")
def calendar_page(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
):
    if user is None:
        return login_redirect()
    return templates.TemplateResponse(
        request=request,
        name="react.html",
        context={
            "user": user,
            "page_title": "Календарь",
            **react_assets("src/entries/calendar-main.tsx"),
            "page_data": {
                "firstName": user.first_name or "",
                "group": user.group_name or "",
                "avatar": user.avatar_base64 or "",
                "today": moscow_today().isoformat(),
                "csrfToken": request.state.csrf_token,
                "initialDate": request.query_params.get("date"),
                "initialLesson": request.query_params.get("lesson"),
            },
        },
    )


@router.get("/calendar/preview", include_in_schema=False)
def calendar_preview_redirect(request: Request):
    return canonical_ui_redirect(request, "/ui/calendar")
