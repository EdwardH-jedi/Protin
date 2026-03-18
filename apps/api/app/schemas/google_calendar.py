from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class GoogleCalendarConnectRequest(BaseModel):
    """Exchange code returned by Google OAuth for stored tokens."""
    code: str
    redirect_uri: str


class GoogleCalendarStatus(BaseModel):
    connected: bool
    calendar_id: str | None = None
    connected_at: datetime | None = None


class CalendarBookingSyncStatus(BaseModel):
    booking_id: UUID
    user_id: UUID
    google_event_id: str
    sync_status: str
    last_synced_at: datetime | None

    model_config = {"from_attributes": True}


class SyncBookingResponse(BaseModel):
    booking_id: UUID
    google_event_id: str
    sync_status: str
