from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, CheckConstraint, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

PROFILE_PHOTO_MAX = 4


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    bio: Mapped[Optional[str]] = mapped_column(String(400))
    birth_year: Mapped[Optional[int]]
    suburb: Mapped[Optional[str]] = mapped_column(String(80))
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="profile")  # noqa: F821
    photos: Mapped[list["ProfilePhoto"]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
        order_by="ProfilePhoto.position",
    )


class ProfilePhoto(Base):
    __tablename__ = "profile_photos"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False
    )
    photo_url: Mapped[str] = mapped_column(String(500), nullable=False)
    position: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    profile: Mapped["UserProfile"] = relationship(back_populates="photos")

    __table_args__ = (
        UniqueConstraint("profile_id", "position", name="uq_profile_photos_profile_position"),
        CheckConstraint(
            "position >= 0 AND position <= 3",
            name="ck_profile_photos_position_range",
        ),
    )


class IdentityPreferences(Base):
    __tablename__ = "identity_preferences"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    open_to: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["any"])
    age_range_min: Mapped[int] = mapped_column(default=18)
    age_range_max: Mapped[int] = mapped_column(default=65)
    max_distance_km: Mapped[int] = mapped_column(default=20)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="identity_preferences")  # noqa: F821


class SportProfile(Base):
    __tablename__ = "sport_profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    preferred_times: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["flexible"])
    gym_name: Mapped[Optional[str]] = mapped_column(String(120))
    golf_club: Mapped[Optional[str]] = mapped_column(String(120))
    goals: Mapped[Optional[str]] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="sport_profiles")  # noqa: F821

    __table_args__ = (UniqueConstraint("user_id", "sport", name="uq_sport_profiles_user_sport"),)
