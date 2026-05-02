from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.discovery import PartnerCardResponse
from app.schemas.venues import VenueResponse


class CreateBookingRequest(BaseModel):
    match_id: UUID
    sport: Literal["gym", "golf", "tennis", "running"]
    starts_at: datetime
    ends_at: datetime
    location: str | None = Field(default=None, max_length=200)
    # Optional reference to a Nearby Courts catalog entry. When provided,
    # the API resolves the venue and includes it in the response. The
    # freeform `location` string is preserved alongside.
    venue_id: UUID | None = None
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
    venue: VenueResponse | None = None

    model_config = {"from_attributes": True}


class BookingListResponse(BaseModel):
    items: list[BookingResponse]
    total: int
    limit: int
    offset: int
