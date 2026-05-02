from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.tournaments import TournamentDetail, TournamentListResponse
from app.services import tournaments as tournaments_service


def _require_tournaments_enabled() -> None:
    """
    Fail-open feature gate for the entire /tournaments router.

    When the flag is off, every tournament route returns 404. The mobile
    app catches the 404 and hides the entry card — same source of truth
    as the server, so client and server can never desync.

    Default policy lives in ``Settings`` (see ``core/config.py``):
      * APP_ENV=local        → ON unless TOURNAMENTS_ENABLED=false
      * APP_ENV=staging|prod → OFF unless TOURNAMENTS_ENABLED=true
    """
    if not get_settings().tournaments_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


router = APIRouter(
    prefix="/tournaments",
    tags=["tournaments"],
    dependencies=[Depends(_require_tournaments_enabled)],
)


@router.get("", response_model=TournamentListResponse)
async def list_tournaments(
    mine: bool = Query(False, description="Only tournaments the caller has joined"),
    sport: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TournamentListResponse:
    return await tournaments_service.list_tournaments(
        db=db,
        current_user_id=current_user.id,
        mine=mine,
        sport=sport,
        limit=limit,
        offset=offset,
    )


@router.get("/{tournament_id}", response_model=TournamentDetail)
async def get_tournament(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TournamentDetail:
    return await tournaments_service.get_tournament(db, tournament_id, current_user.id)


@router.post("/{tournament_id}/join", response_model=TournamentDetail)
async def join_tournament(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TournamentDetail:
    return await tournaments_service.join_tournament(db, tournament_id, current_user.id)


@router.post("/{tournament_id}/leave", response_model=TournamentDetail)
async def leave_tournament(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TournamentDetail:
    return await tournaments_service.leave_tournament(db, tournament_id, current_user.id)
