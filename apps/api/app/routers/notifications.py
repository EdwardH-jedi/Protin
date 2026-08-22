import hmac
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
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
_PROTECTED_ENVS = {"staging", "production"}


def validate_internal_api_token_config() -> None:
    settings = get_settings()
    if settings.app_env in _PROTECTED_ENVS:
        from app.core.protected_config import validate_strong_secret

        validate_strong_secret("INTERNAL_API_TOKEN", settings.internal_api_token)


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    settings = get_settings()
    expected = settings.internal_api_token.strip()

    if not expected:
        if settings.app_env == "local":
            return
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal API token is not configured on this server.",
        )

    if x_internal_token is None or not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API token.",
        )


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
    _: None = Depends(require_internal_token),
    db: AsyncSession = Depends(get_db),
) -> ProcessNotificationsResult:
    """
    Send all due push notifications.
    Intended to be called by a cron job or CI health-check loop.
    Not authenticated — restrict to internal network in production.
    """
    return await notif_service.process_pending_notifications(db)
