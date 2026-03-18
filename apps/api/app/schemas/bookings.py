from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.discovery import PartnerCardResponse


class CreateBookingRequest(BaseModel):
    match_id: UUID
    sport: Literal["gym", "golf"]
    starts_at: datetime
    ends_at: datetime
    location: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=500)


class BookingResponse(BaseModel):
    id: UUID
    match_id: UUID
    proposer_id: UUID
    partner_id: UUID
    sport: str
    starts_at: datetime
    ends_at: datetime
    location: str | None
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    partner: PartnerCardResponse

    model_config = {"from_attributes": True}


class BookingListResponse(BaseModel):
    items: list[BookingResponse]
    total: int
    limit: int
    offset: int
