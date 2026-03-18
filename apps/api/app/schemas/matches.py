from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.discovery import PartnerCardResponse


class MatchResponse(BaseModel):
    id: UUID
    user1_id: UUID
    user2_id: UUID
    sport: str
    status: str
    created_at: datetime
    partner: PartnerCardResponse


class MatchListResponse(BaseModel):
    items: list[MatchResponse]
    total: int
    limit: int
    offset: int


class ArchiveMatchRequest(BaseModel):
    reason: str | None = None
