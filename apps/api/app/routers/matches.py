from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.matches import ArchiveMatchRequest, MatchListResponse, MatchResponse
from app.services import matches as matches_service

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("", response_model=MatchListResponse)
async def list_matches(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MatchListResponse:
    return await matches_service.list_matches(
        db=db,
        current_user_id=current_user.id,
        limit=limit,
        offset=offset,
    )


@router.patch("/{match_id}", response_model=MatchResponse)
async def archive_match(
    match_id: UUID,
    body: ArchiveMatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MatchResponse:
    result = await matches_service.archive_match(
        db=db,
        match_id=match_id,
        current_user_id=current_user.id,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found or you are not a participant.",
        )
    return result
