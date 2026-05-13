"""
Honor System routes — local sports honor titles
(e.g. "Annandale Tennis Champion") and their per-area rank leaderboards.

Two routers, mounted at ``/rankings`` and ``/honors``. Both require
authentication via the standard bearer dependency so unauthenticated
scraping of the leaderboard is blocked.

READ-ONLY by design. The mutation entry point —
:func:`app.services.honor_system.record_match_result_for_honor` — is
deliberately NOT exposed as a public route. Until verified
challenge/tournament/group-event result authorization exists, any
public POST that lets an authenticated user submit a result lets that
user arbitrarily mutate two other users' rankings, wins/losses,
streaks, title holders, and honor history. The previous
``POST /honors/result`` endpoint shipped exactly that surface and has
been removed; the future verified-result hook should call the service
function directly.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.honor_system import (
    HonorTitleRead,
    RankingListResponse,
    RankProfileRead,
)
from app.services import honor_system as honor_system_service

rankings_router = APIRouter(prefix="/rankings", tags=["honor-system"])
honors_router = APIRouter(prefix="/honors", tags=["honor-system"])


# ---------------------------------------------------------------------------
# Rankings (read-only)
# ---------------------------------------------------------------------------


@rankings_router.get("/me", response_model=RankProfileRead)
async def get_my_rank_profile(
    sport: str = Query(..., min_length=1, max_length=30),
    area: str = Query(..., min_length=1, max_length=80),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RankProfileRead:
    return await honor_system_service.get_my_rank_profile(
        db, current_user.id, sport=sport, area=area
    )


@rankings_router.get("", response_model=RankingListResponse)
async def list_rankings(
    sport: str = Query(..., min_length=1, max_length=30),
    area: str = Query(..., min_length=1, max_length=80),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RankingListResponse:
    return await honor_system_service.list_rankings(
        db, sport=sport, area=area, limit=limit, offset=offset
    )


# ---------------------------------------------------------------------------
# Honors (read-only)
# ---------------------------------------------------------------------------


@honors_router.get("", response_model=HonorTitleRead | None)
async def get_current_honor(
    sport: str = Query(..., min_length=1, max_length=30),
    area: str = Query(..., min_length=1, max_length=80),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HonorTitleRead | None:
    """
    Returns the current honor title for ``(sport, area)``, or ``null``
    if no title exists yet (no recorded match results in this area).
    """
    return await honor_system_service.get_current_honor(
        db, sport=sport, area=area
    )


@honors_router.get("/me", response_model=list[HonorTitleRead])
async def list_my_titles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HonorTitleRead]:
    return await honor_system_service.list_titles_held_by(db, current_user.id)
