from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ChallengeCreateRequest(BaseModel):
    """
    Body for ``POST /challenges``.

    The challenger is the authenticated caller — never read from the
    request body. Rating deltas, status, and honor-title changes are
    not client-controlled.
    """

    opponent_user_id: UUID
    sport: str = Field(min_length=1, max_length=30)
    area: str = Field(min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=500)


class ChallengeRead(BaseModel):
    id: UUID
    challenger_user_id: UUID
    opponent_user_id: UUID
    sport: str
    area: str
    status: str
    note: str | None
    created_at: datetime
    updated_at: datetime
    accepted_at: datetime | None
    completed_at: datetime | None
    verified_at: datetime | None
    expires_at: datetime | None

    model_config = {"from_attributes": True}


class ChallengeListResponse(BaseModel):
    items: list[ChallengeRead]
    total: int


class ChallengeResultSubmitRequest(BaseModel):
    """
    Body for ``POST /challenges/{id}/result``.

    ``submitted_by_user_id`` is taken from the authenticated user, not
    the body — preventing a participant from spoofing the source of a
    submission.
    """

    winner_user_id: UUID
    loser_user_id: UUID


class ChallengeResultSubmissionRead(BaseModel):
    id: UUID
    challenge_id: UUID
    submitted_by_user_id: UUID
    winner_user_id: UUID
    loser_user_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
