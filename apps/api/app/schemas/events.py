from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

EventMode = Literal["casual", "ranked"]
EventVisibility = Literal["public", "private"]
EventStatus = Literal["open", "full", "cancelled", "completed"]
AttendanceStatus = Literal["pending", "attended", "no_show", "excused"]
# Self-report subset — participants cannot brand themselves no_show or
# reset to pending.
SelfAttendanceStatus = Literal["attended", "excused"]
ParticipantStatus = Literal["joined", "left"]


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
    # NOTE: attendance_status is intentionally NOT exposed here.
    # General event detail (GET /events/{id}) must not leak each
    # participant's attendance outcome to every viewer. Attendance is
    # served only by GET /events/{id}/attendance, which scopes results
    # to host / self.


class EventDetail(EventSummary):
    participants: list[EventParticipantSummary]


class EventListResponse(BaseModel):
    items: list[EventSummary]
    total: int


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------


class AttendanceEntry(BaseModel):
    event_id: UUID
    participant_user_id: UUID
    display_name: str
    participant_status: str
    attendance_status: str
    joined_at: datetime
    left_at: datetime | None = None
    attendance_confirmed_by_host_at: datetime | None = None
    attendance_self_reported_at: datetime | None = None
    attendance_note: str | None = None

    model_config = {"from_attributes": True}


class AttendanceListResponse(BaseModel):
    event_id: UUID
    host_user_id: UUID
    items: list[AttendanceEntry]


class HostAttendanceUpdateRequest(BaseModel):
    participant_user_id: UUID
    attendance_status: AttendanceStatus
    attendance_note: str | None = Field(default=None, max_length=500)


class SelfAttendanceRequest(BaseModel):
    attendance_status: SelfAttendanceStatus
    attendance_note: str | None = Field(default=None, max_length=500)
