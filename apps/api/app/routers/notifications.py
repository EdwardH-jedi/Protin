from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.schemas.notifications import (
    ProcessNotificationsResult,
    PushTokenResponse,
    RegisterPushTokenRequest,
)
from app.services import notifications as notif_service

router = APIRouter(prefix="/notifications", tags=["notifications"])
internal_router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/token", response_model=PushTokenResponse, status_code=201)
async def register_token(
    req: RegisterPushTokenRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PushTokenResponse:
    """Register or update a device push token for the current user."""
    return await notif_service.register_push_token(db, current_user.id, req)


@router.delete("/token/{token_id}", status_code=204)
async def unregister_token(
    token_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Unregister a device push token (e.g. on logout)."""
    await notif_service.unregister_push_token(db, current_user.id, token_id)


@internal_router.post("/process-notifications", response_model=ProcessNotificationsResult)
async def process_notifications(
    db: AsyncSession = Depends(get_db),
) -> ProcessNotificationsResult:
    """
    Send all due push notifications.
    Intended to be called by a cron job or CI health-check loop.
    Not authenticated — restrict to internal network in production.
    """
    return await notif_service.process_pending_notifications(db)
