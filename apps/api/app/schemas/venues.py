from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

Sport = Literal[
    "gym",
    "golf",
    "tennis",
    "running",
    "basketball",
    "badminton",
    "soccer",
    "football",
]

# Source mode for /venues/nearby. Default is "seed" — pure v1.0 behaviour
# preserved. "places" hits the Google Places provider only. "both" merges
# seed first, then fills with Places candidates and dedupes.
VenueSource = Literal["seed", "places", "both"]

# Per-item provenance marker. Stays "seed" for local catalog rows so
# existing mobile clients that ignore the new field see no change in
# behaviour; "google_places" identifies rows synthesised from the
# Stream 1 provider.
VenueSourceTag = Literal["seed", "google_places"]

# Coarse status of the Google Places provider on a nearby response.
# Designed so the mobile picker can pick a single, non-leaky message
# per state without ever seeing raw Google error text. Mapping rules
# live in app.services.venues.list_nearby_venues.
ProviderStatus = Literal[
    "ok",
    "disabled",
    "missing_coordinates",
    "quota_exceeded",
    "error",
]

# Advisory per-row match confidence vs the requested sport. Always
# emitted; defaults to "medium" on seed rows (curated catalog — neither
# strongly sport-tagged nor uncertain). See places.py:_classify_confidence
# for the Places-derived classification rules.
VenueConfidence = Literal["high", "medium", "low"]


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
    # Google's primary type classification (e.g. "tennis_court", "gym")
    # — echoed verbatim so the picker can label rows beyond the
    # requested sport. Null for seed rows.
    primary_type: str | None = None
    # Deep link into the Google Maps app/web for this place. Populated
    # only on Places rows; used by the picker's "Open in Maps" entry.
    google_maps_uri: str | None = None
    # HTML attribution snippets Google requires alongside Places content
    # in addition to the global "Powered by Google" chip. Empty list
    # for seed rows.
    attributions: list[str] = Field(default_factory=list)
    # Advisory match confidence vs the requested sport. Picker may use
    # this to fade low-confidence rows; venues are never filtered out
    # solely on confidence.
    confidence: VenueConfidence = "medium"

    model_config = {"from_attributes": True}


class NearbyVenuesResponse(BaseModel):
    items: list[VenueResponse]
    total: int
    # Coarse provider state — see ProviderStatus. Default "disabled"
    # keeps the wire shape compatible with v1.0 callers that didn't ask
    # for Places and ignore the field.
    provider_status: ProviderStatus = "disabled"
    # Opaque cursor for the next page of Places (Text Search) results.
    # Mobile passes the value back as cursor=<value> on the next call.
    # Null when no further pages are available.
    next_cursor: str | None = None


class PlaceDetailsResponse(BaseModel):
    """Normalised Google Place Details (New) response.

    Returned from ``GET /venues/places/{place_id}`` — a lazy-load
    endpoint that is called only when the user opens a Google-Places
    venue from the picker. Never used during list/search because Place
    Details is on a heavier SKU bracket; deferring it keeps per-session
    Places spend bounded by the number of taps, not the number of
    visible rows.
    """

    place_id: str
    name: str
    latitude: float
    longitude: float
    address: str | None = None
    types: list[str] = Field(default_factory=list)
    primary_type: str | None = None
    google_maps_uri: str | None = None
    website_uri: str | None = None
    national_phone_number: str | None = None
    international_phone_number: str | None = None
    business_status: str | None = None
    rating: float | None = None
    user_rating_count: int | None = None
    # Weekday-formatted opening hours (e.g. "Monday: 6:00 AM – 10:00 PM").
    # Plural strings rather than the raw timeslot grid keeps the mobile
    # render trivial and avoids importing Google's timezone semantics.
    opening_hours: list[str] = Field(default_factory=list)
    # Google requires these attribution snippets be shown alongside any
    # surfaced Place Details content (in addition to the global
    # "Powered by Google" chip).
    attributions: list[str] = Field(default_factory=list)
    # Always true for this endpoint — mirror of NearbyVenue rows so
    # mobile can use one rendering rule for "show attribution".
    attribution_required: bool = True


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
    # Free-text Google Places (Text Search) override. When present the
    # backend uses this string instead of the default sport-based phrase
    # ("tennis court", "gym", …).
    q: str | None = None
    # Opaque pagination cursor returned from a prior response as
    # next_cursor. Passed back to Google Places Text Search as
    # pageToken.
    cursor: str | None = None

    @model_validator(mode="after")
    def _both_or_neither(self) -> "NearbyVenuesQuery":
        if (self.lat is None) != (self.lng is None):
            raise ValueError("lat and lng must be provided together")
        return self
