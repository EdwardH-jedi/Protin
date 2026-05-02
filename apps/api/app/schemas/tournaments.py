from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

Sport = Literal["gym", "golf", "tennis", "running"]


class TournamentSummary(BaseModel):
    id: UUID
    title: str
    sport: str
    description: str | None
    area: str | None
    venue_id: UUID | None
    starts_at: datetime
    capacity: int
    participant_count: int
    spots_left: int
    status: str
    has_joined: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TournamentParticipantSummary(BaseModel):
    user_id: UUID
    display_name: str
    joined_at: datetime


class TournamentDetail(TournamentSummary):
    participants: list[TournamentParticipantSummary]


class TournamentListResponse(BaseModel):
    items: list[TournamentSummary]
    total: int
