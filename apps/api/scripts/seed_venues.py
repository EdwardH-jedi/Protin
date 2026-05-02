"""Idempotent venue catalog seed.

Run from ``apps/api/``::

    python -m scripts.seed_venues

Reads ``apps/api/data/venues_sydney.json`` and upserts each entry by
(name, area). Re-running the script will not create duplicates and will
patch any field changes on existing rows.

Safe in any environment — the venue catalog is reference data, not
user-generated. No app_env guard.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models.venue import Venue

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "venues_sydney.json"


async def _seed() -> int:
    settings = get_settings()
    engine = create_async_engine(settings.async_postgres_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    if not DATA_PATH.exists():
        print(f"[seed_venues] No data file at {DATA_PATH}", file=sys.stderr)
        return 1

    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))

    inserted = 0
    updated = 0

    async with Session() as db:
        for entry in payload:
            name = entry["name"]
            area = entry.get("area")

            stmt = select(Venue).where(Venue.name == name, Venue.area == area)
            existing = (await db.execute(stmt)).scalar_one_or_none()

            if existing is None:
                venue = Venue(
                    name=name,
                    sport_tags=entry["sport_tags"],
                    area=area,
                    address=entry.get("address"),
                    latitude=float(entry["latitude"]),
                    longitude=float(entry["longitude"]),
                    booking_url=entry.get("booking_url"),
                    notes=entry.get("notes"),
                    is_bookable=bool(entry.get("is_bookable", False)),
                )
                db.add(venue)
                inserted += 1
            else:
                existing.sport_tags = entry["sport_tags"]
                existing.address = entry.get("address")
                existing.latitude = float(entry["latitude"])
                existing.longitude = float(entry["longitude"])
                existing.booking_url = entry.get("booking_url")
                existing.notes = entry.get("notes")
                existing.is_bookable = bool(entry.get("is_bookable", False))
                updated += 1

        await db.commit()

    await engine.dispose()
    print(f"[seed_venues] inserted={inserted} updated={updated} total={inserted + updated}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_seed()))
