from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, Float, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Venue(Base):
    """
    A static court / venue catalog row used by the Nearby Courts feature.

    Coordinates are stored as plain floats (not PostGIS) — distance is
    computed in application code with Haversine. The catalog is small
    (tens of rows seeded from JSON) so spatial indexing is unnecessary.

    `sport_tags` is a JSON array of sport keys (gym|golf|tennis|running)
    so a single venue can serve multiple sports. JSON over PG ARRAY keeps
    SQLite tests working without a dialect-specific column type.

    `is_bookable` is true ONLY when `booking_url` leads to a real booking
    surface. The mobile UI must not advertise "bookable" without this flag.
    """

    __tablename__ = "venues"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    sport_tags: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    area: Mapped[Optional[str]] = mapped_column(String(80))
    address: Mapped[Optional[str]] = mapped_column(String(300))
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    booking_url: Mapped[Optional[str]] = mapped_column(String(500))
    notes: Mapped[Optional[str]] = mapped_column(String(500))
    is_bookable: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )
