from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.rank import HonorSummary, RankSummary
from app.services import rank as rank_service

router = APIRouter(prefix="/users", tags=["rank"])


@router.get("/me/rank-summary", response_model=RankSummary)
async def get_my_rank_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RankSummary:
    return await rank_service.compute_summary(db, current_user.id)


@router.get("/{user_id}/rank-summary", response_model=RankSummary)
async def get_user_rank_summary(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RankSummary:
    """
    Public-safe summary for any registered user.

    Returns the same shape as the self endpoint — by design, the schema
    contains no moderation data, no event log, and no negative-event
    breakdown. Authentication is required so unauthenticated scraping
    is blocked, but no match-existence check is enforced here so the
    Discovery preview can show the badge.
    """
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if target is None or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return await rank_service.compute_summary(db, user_id)


# ---------------------------------------------------------------------------
# V1.1 Honor / Gang Score — separate router so the new /rank prefix
# doesn't disturb the legacy /users/{id}/rank-summary callers.
# ---------------------------------------------------------------------------

honor_router = APIRouter(prefix="/rank", tags=["rank"])


@honor_router.get("/me", response_model=HonorSummary)
async def get_my_honor_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HonorSummary:
    return await rank_service.compute_honor_summary(db, current_user.id)


@honor_router.get("/users/{user_id}", response_model=HonorSummary)
async def get_user_honor_summary(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HonorSummary:
    """
    Public-safe Honor / Gang Score summary for a registered user.

    The response shape is deliberately the sanitized superset — no
    report rows, no block rows, no attendance notes, no individual
    event participation rows. Auth is required so unauthenticated
    scraping is blocked.
    """
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if target is None or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return await rank_service.compute_honor_summary(db, user_id)
