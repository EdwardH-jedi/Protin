from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

Sport = Literal["gym", "golf", "tennis", "running"]


class VenueResponse(BaseModel):
    id: UUID
    name: str
    sport_tags: list[str]
    area: str | None
    address: str | None
    latitude: float
    longitude: float
    booking_url: str | None
    notes: str | None
    is_bookable: bool
    # Distance from the query lat/lng in kilometers when those were
    # supplied; None when the caller did not provide coordinates.
    distance_km: float | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NearbyVenuesResponse(BaseModel):
    items: list[VenueResponse]
    total: int


class NearbyVenuesQuery(BaseModel):
    """Used by tests / docs only — the route declares query params directly."""

    sport: Sport
    lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    lng: float | None = Field(default=None, ge=-180.0, le=180.0)
    # Ignored when lat/lng are absent (no centre to measure from).
    radius_km: float = Field(default=10.0, ge=1.0, le=50.0)
    limit: int = Field(default=20, ge=1, le=50)

    @model_validator(mode="after")
    def _both_or_neither(self) -> "NearbyVenuesQuery":
        if (self.lat is None) != (self.lng is None):
            raise ValueError("lat and lng must be provided together")
        return self
