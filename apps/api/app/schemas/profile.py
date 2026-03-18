from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserProfileCreate(BaseModel):
    display_name: str = Field(max_length=80)
    bio: Optional[str] = Field(None, max_length=400)
    birth_year: Optional[int] = Field(None, ge=1940, le=2005)
    suburb: Optional[str] = Field(None, max_length=80)


class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=80)
    bio: Optional[str] = Field(None, max_length=400)
    birth_year: Optional[int] = Field(None, ge=1940, le=2005)
    suburb: Optional[str] = Field(None, max_length=80)


class UserProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    display_name: str
    bio: Optional[str]
    birth_year: Optional[int]
    suburb: Optional[str]
    avatar_url: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


_VALID_OPEN_TO = {"any", "male", "female", "non_binary"}


class IdentityPreferencesCreate(BaseModel):
    open_to: list[str] = ["any"]
    age_range_min: int = Field(18, ge=18, le=80)
    age_range_max: int = Field(65, ge=18, le=80)
    max_distance_km: int = Field(20, ge=1, le=100)

    @field_validator("open_to")
    @classmethod
    def validate_open_to(cls, v: list[str]) -> list[str]:
        invalid = set(v) - _VALID_OPEN_TO
        if invalid:
            raise ValueError(f"Invalid open_to values: {invalid}. Must be subset of {_VALID_OPEN_TO}")
        return v


class IdentityPreferencesResponse(BaseModel):
    id: UUID
    user_id: UUID
    open_to: list[str]
    age_range_min: int
    age_range_max: int
    max_distance_km: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SportProfileCreate(BaseModel):
    sport: Literal["gym", "golf"]
    level: Literal["beginner", "intermediate", "advanced"]
    preferred_times: list[Literal["morning", "afternoon", "evening", "flexible"]] = ["flexible"]
    gym_name: Optional[str] = Field(None, max_length=120)
    golf_club: Optional[str] = Field(None, max_length=120)
    goals: Optional[str] = Field(None, max_length=300)


class SportProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    sport: str
    level: str
    preferred_times: list[str]
    gym_name: Optional[str]
    golf_club: Optional[str]
    goals: Optional[str]
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
