from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.encryption import EncryptedString
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    hashed_password: Mapped[Optional[str]] = mapped_column(nullable=True)
    # Apple Sign-in subject claim ("sub"). Unique per Apple user; present only for
    # users that signed up via Apple. NULL for email/password or Google-only users.
    apple_sub: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    # Apple Sign-in refresh token, encrypted at rest (same field-encryption as
    # the Google Calendar OAuth tokens). Stored so account deletion can revoke
    # the user's Sign in with Apple tokens (App Store 5.1.1(v)). NULL for
    # email/password users and for Apple users created before this column
    # existed — they re-populate it on their next Apple sign-in.
    apple_refresh_token: Mapped[Optional[str]] = mapped_column(EncryptedString(1024), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)

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
