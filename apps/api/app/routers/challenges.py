"""
Sports challenge routes.

The only public surface that can ultimately fire
:func:`app.services.honor_system.record_match_result_for_honor`. Every
endpoint requires an authenticated user via the standard bearer
dependency; participant-only authorization is enforced inside the
challenge service.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.challenges import (
    ChallengeCreateRequest,
    ChallengeListResponse,
    ChallengeRead,
    ChallengeResultSubmitRequest,
)
from app.services import challenges as challenges_service

router = APIRouter(prefix="/challenges", tags=["challenges"])


@router.post("", response_model=ChallengeRead, status_code=status.HTTP_201_CREATED)
async def create_challenge(
    body: ChallengeCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChallengeRead:
    return await challenges_service.create_challenge(
        db,
        current_user_id=current_user.id,
        opponent_user_id=body.opponent_user_id,
        sport=body.sport,
        area=body.area,
        note=body.note,
    )


@router.get("", response_model=ChallengeListResponse)
async def list_my_challenges(
    status_filter: str | None = Query(
        None,
        alias="status",
        min_length=1,
        max_length=20,
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChallengeListResponse:
    return await challenges_service.list_my_challenges(
        db,
        current_user_id=current_user.id,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )


@router.get("/{challenge_id}", response_model=ChallengeRead)
async def get_challenge(
    challenge_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChallengeRead:
    return await challenges_service.get_challenge(db, current_user_id=current_user.id, challenge_id=challenge_id)


@router.post("/{challenge_id}/accept", response_model=ChallengeRead)
async def accept_challenge(
    challenge_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChallengeRead:
    return await challenges_service.accept_challenge(db, current_user_id=current_user.id, challenge_id=challenge_id)


@router.post("/{challenge_id}/decline", response_model=ChallengeRead)
async def decline_challenge(
    challenge_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChallengeRead:
    return await challenges_service.decline_challenge(db, current_user_id=current_user.id, challenge_id=challenge_id)


@router.post("/{challenge_id}/cancel", response_model=ChallengeRead)
async def cancel_challenge(
    challenge_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChallengeRead:
    return await challenges_service.cancel_challenge(db, current_user_id=current_user.id, challenge_id=challenge_id)


@router.post("/{challenge_id}/result", response_model=ChallengeRead)
async def submit_challenge_result(
    challenge_id: UUID,
    body: ChallengeResultSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChallengeRead:
    return await challenges_service.submit_challenge_result(
        db,
        current_user_id=current_user.id,
        challenge_id=challenge_id,
        winner_user_id=body.winner_user_id,
        loser_user_id=body.loser_user_id,
    )
