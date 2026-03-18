from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # relationships
    profile: Mapped[Optional["UserProfile"]] = relationship(  # noqa: F821
        back_populates="user", uselist=False
    )
    identity_preferences: Mapped[Optional["IdentityPreferences"]] = relationship(  # noqa: F821
        back_populates="user", uselist=False
    )
    sport_profiles: Mapped[list["SportProfile"]] = relationship(  # noqa: F821
        back_populates="user"
    )
