from fastapi import APIRouter

from app.routers.ui import auth, calendar, dashboard, email_verification, privacy, profile, tasks

router = APIRouter(tags=["web"])
router.include_router(auth.router, prefix="/ui")
router.include_router(email_verification.router, prefix="/ui")
router.include_router(privacy.router, prefix="/ui")
router.include_router(dashboard.router, prefix="/ui")
router.include_router(calendar.router, prefix="/ui")
router.include_router(profile.router, prefix="/ui")
router.include_router(tasks.router, prefix="/ui")
