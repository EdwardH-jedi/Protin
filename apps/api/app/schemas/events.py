from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

EventMode = Literal["casual", "ranked"]
EventVisibility = Literal["public", "private"]
EventStatus = Literal["open", "full", "cancelled", "completed"]


class CreateEventRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    sport: str = Field(min_length=1, max_length=30)
    mode: EventMode = "casual"
    starts_at: datetime
    location_text: str = Field(min_length=1, max_length=200)
    capacity: int = Field(ge=1, le=200)
    description: str | None = Field(default=None, max_length=1000)
    visibility: EventVisibility = "public"


class EventHost(BaseModel):
    id: UUID
    display_name: str


class EventSummary(BaseModel):
    id: UUID
    host_user_id: UUID
    host: EventHost | None = None
    title: str
    sport: str
    mode: str
    starts_at: datetime
    location_text: str
    capacity: int
    participant_count: int
    spots_left: int
    visibility: str
    status: str
    has_joined: bool
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EventParticipantSummary(BaseModel):
    user_id: UUID
    display_name: str
    joined_at: datetime


class EventDetail(EventSummary):
    participants: list[EventParticipantSummary]


class EventListResponse(BaseModel):
    items: list[EventSummary]
    total: int
