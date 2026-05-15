from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

Sport = Literal["gym", "golf", "tennis", "running"]

# Source mode for /venues/nearby. Default is "seed" — pure v1.0 behaviour
# preserved. "places" hits the Google Places provider only. "both" merges
# seed first, then fills with Places candidates and dedupes.
VenueSource = Literal["seed", "places", "both"]

# Per-item provenance marker. Stays "seed" for local catalog rows so
# existing mobile clients that ignore the new field see no change in
# behaviour; "google_places" identifies rows synthesised from the
# Stream 1 provider.
VenueSourceTag = Literal["seed", "google_places"]


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
    # ── v1.1 additive fields ────────────────────────────────────────────
    # All three default to "looks like a v1.0 seed row" so existing
    # mobile clients that ignore them are byte-compatible.
    source: VenueSourceTag = "seed"
    # Opaque Google Places id (e.g. "places/ChIJ…"). Populated only for
    # rows derived from the Places provider; None for local seed rows.
    # Persisted nowhere — recomputed on each request.
    provider_place_id: str | None = None
    # Google Places terms require a "Powered by Google" attribution
    # whenever Places-sourced rows are surfaced. The mobile UI uses
    # this flag in v1.1+ to decide whether to render the attribution
    # chip; seed rows do not require it.
    attribution_required: bool = False

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
    # Default "seed" preserves v1.0 wire shape exactly — clients that
    # never pass this param get the unchanged behaviour.
    source: VenueSource = "seed"

    @model_validator(mode="after")
    def _both_or_neither(self) -> "NearbyVenuesQuery":
        if (self.lat is None) != (self.lng is None):
            raise ValueError("lat and lng must be provided together")
        return self
