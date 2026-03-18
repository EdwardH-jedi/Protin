from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class RegisterPushTokenRequest(BaseModel):
    token: str = Field(..., min_length=1, max_length=256)
    platform: Literal["ios", "android", "web"] = "ios"


class PushTokenResponse(BaseModel):
    id: UUID
    user_id: UUID
    token: str
    platform: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProcessNotificationsResult(BaseModel):
    processed: int
    failed: int
