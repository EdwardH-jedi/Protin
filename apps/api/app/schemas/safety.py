from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateReportRequest(BaseModel):
    reported_user_id: UUID
    reason: Literal["spam", "inappropriate", "fake", "harassment", "other"]
    context: str | None = Field(default=None, max_length=1000)


class ReportResponse(BaseModel):
    id: UUID
    reporter_id: UUID
    reported_id: UUID
    reason: str
    context: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class BlockResponse(BaseModel):
    id: UUID
    blocker_id: UUID
    blocked_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class BlockListResponse(BaseModel):
    items: list[BlockResponse]
    total: int
