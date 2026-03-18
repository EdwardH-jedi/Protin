from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class SportProfileSummary(BaseModel):
    sport: str
    level: str
    gym_name: str | None = None
    golf_club: str | None = None


class PartnerCardResponse(BaseModel):
    user_id: UUID
    display_name: str
    suburb: str | None = None
    bio_excerpt: str | None = None
    avatar_url: str | None = None
    age: int | None = None
    sport_profiles: list[SportProfileSummary]


class DiscoveryFeedResponse(BaseModel):
    items: list[PartnerCardResponse]
    total: int
    limit: int
    offset: int


class RecordActionRequest(BaseModel):
    target_user_id: UUID
    action: Literal["like", "pass", "save"]
    sport: Literal["gym", "golf"]


class RecordActionResponse(BaseModel):
    action: str
    match_created: bool
    match_id: UUID | None = None
