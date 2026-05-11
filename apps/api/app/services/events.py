"""
Event (group "battle" / "game") service.

Distinct from Booking (1:1 partner session) and Tournament (multi-round
structured competition). The data model leaves clean extension points
for the future Report/Block and Attendance/No-show streams (status,
soft-leave audit trail, visibility flag).
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import (
    EVENT_MODES,
    EVENT_VISIBILITIES,
    Event,
    EventParticipant,
)
from app.models.profile import UserProfile
from app.schemas.events import (
    CreateEventRequest,
    EventDetail,
    EventHost,
    EventListResponse,
    EventParticipantSummary,
    EventSummary,
)

# Statuses where /events lists the row by default.
_VISIBLE_STATUSES: frozenset[str] = frozenset({"open", "full"})

# Statuses a participant can leave from.
_LEAVABLE_STATUSES: frozenset[str] = frozenset({"open", "full"})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _joined_count(db: AsyncSession, event_id: UUID) -> int:
    stmt = select(func.count(EventParticipant.id)).where(
        EventParticipant.event_id == event_id,
        EventParticipant.status == "joined",
    )
    return int((await db.execute(stmt)).scalar_one())


async def _active_participant(
    db: AsyncSession, event_id: UUID, user_id: UUID
) -> EventParticipant | None:
    stmt = select(EventParticipant).where(
        EventParticipant.event_id == event_id,
        EventParticipant.user_id == user_id,
        EventParticipant.status == "joined",
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _resolve_host(
    db: AsyncSession, host_user_id: UUID
) -> EventHost:
    stmt = select(UserProfile.display_name).where(UserProfile.user_id == host_user_id)
    name = (await db.execute(stmt)).scalar_one_or_none()
    return EventHost(id=host_user_id, display_name=name or "Host")


async def _get_event_or_404(db: AsyncSession, event_id: UUID) -> Event:
    e = (
        await db.execute(select(Event).where(Event.id == event_id))
    ).scalar_one_or_none()
    if e is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
        )
    return e


async def _to_summary(
    db: AsyncSession, e: Event, current_user_id: UUID
) -> EventSummary:
    count = await _joined_count(db, e.id)
    joined = (await _active_participant(db, e.id, current_user_id)) is not None
    host = await _resolve_host(db, e.host_user_id)
    return EventSummary(
        id=e.id,
        host_user_id=e.host_user_id,
        host=host,
        title=e.title,
        sport=e.sport,
        mode=e.mode,
        starts_at=e.starts_at,
        location_text=e.location_text,
        capacity=e.capacity,
        participant_count=count,
        spots_left=max(0, e.capacity - count),
        visibility=e.visibility,
        status=e.status,
        has_joined=joined,
        description=e.description,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_event(
    db: AsyncSession, host_user_id: UUID, body: CreateEventRequest
) -> EventDetail:
    if body.mode not in EVENT_MODES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid mode: {body.mode}",
        )
    if body.visibility not in EVENT_VISIBILITIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid visibility: {body.visibility}",
        )
    # Private events not yet exposed via list, but we accept the value
    # so the future Friends-only stream can flip it on without a
    # migration. Reject anything that's not public for now to avoid
    # creating orphan-private rows nobody can see.
    if body.visibility != "public":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only public events are supported in this release",
        )

    e = Event(
        host_user_id=host_user_id,
        title=body.title.strip(),
        sport=body.sport.strip().lower(),
        mode=body.mode,
        starts_at=body.starts_at,
        location_text=body.location_text.strip(),
        capacity=body.capacity,
        description=(body.description or None),
        visibility=body.visibility,
        status="open",
    )
    db.add(e)
    await db.flush()

    # Host auto-joins as the first participant. Matches the brief's
    # "host should be treated as participant"; simplifies capacity
    # accounting and the mobile join-state badge.
    db.add(
        EventParticipant(
            event_id=e.id,
            user_id=host_user_id,
            status="joined",
        )
    )
    await db.flush()

    # If capacity is exactly 1 (degenerate but valid) the host fills it
    # immediately — mirror the join-flow's full-status flip so the row
    # is consistent on read.
    if e.capacity <= 1:
        e.status = "full"

    await db.commit()
    await db.refresh(e)
    return await get_event(db, e.id, host_user_id)


async def list_events(
    db: AsyncSession,
    current_user_id: UUID,
    *,
    mine: bool = False,
    sport: str | None = None,
    mode: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> EventListResponse:
    base = select(Event)
    if mine:
        # Events the user has joined (active) OR hosts.
        base = (
            base.join(
                EventParticipant,
                EventParticipant.event_id == Event.id,
                isouter=True,
            )
            .where(
                (Event.host_user_id == current_user_id)
                | (
                    (EventParticipant.user_id == current_user_id)
                    & (EventParticipant.status == "joined")
                )
            )
            .distinct()
        )
    else:
        base = base.where(
            Event.status.in_(_VISIBLE_STATUSES),
            Event.visibility == "public",
        )

    if sport is not None:
        base = base.where(Event.sport == sport.strip().lower())

    if mode is not None:
        if mode not in EVENT_MODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid mode: {mode}",
            )
        base = base.where(Event.mode == mode)

    base = base.order_by(Event.starts_at.asc())

    rows = list((await db.execute(base.offset(offset).limit(limit))).scalars().all())
    total = int(
        (
            await db.execute(select(func.count()).select_from(base.subquery()))
        ).scalar_one()
    )

    items: list[EventSummary] = []
    for e in rows:
        items.append(await _to_summary(db, e, current_user_id))
    return EventListResponse(items=items, total=total)


async def get_event(
    db: AsyncSession, event_id: UUID, current_user_id: UUID
) -> EventDetail:
    e = await _get_event_or_404(db, event_id)

    # Defensive private-visibility guard. POST /events rejects
    # visibility='private' for now, but the column accepts it so a
    # future stream (or a seeded row) shouldn't leak details to
    # outsiders. Treat as 404 so non-participants can't probe for
    # existence — matches the project's preference for hiding
    # inaccessible resources rather than advertising them with 403.
    if e.visibility == "private" and current_user_id != e.host_user_id:
        joined = await _active_participant(db, e.id, current_user_id)
        if joined is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
            )

    summary = await _to_summary(db, e, current_user_id)

    participants_stmt = (
        select(EventParticipant, UserProfile.display_name)
        .where(
            EventParticipant.event_id == e.id,
            EventParticipant.status == "joined",
        )
        .outerjoin(UserProfile, UserProfile.user_id == EventParticipant.user_id)
        .order_by(EventParticipant.joined_at.asc())
    )
    rows = (await db.execute(participants_stmt)).all()
    participants = [
        EventParticipantSummary(
            user_id=p.user_id,
            display_name=display_name or "Player",
            joined_at=p.joined_at,
        )
        for (p, display_name) in rows
    ]
    return EventDetail(**summary.model_dump(), participants=participants)


async def join_event(
    db: AsyncSession, event_id: UUID, current_user_id: UUID
) -> EventDetail:
    locked_stmt = select(Event).where(Event.id == event_id).with_for_update()
    e = (await db.execute(locked_stmt)).scalar_one_or_none()
    if e is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
        )

    if e.status in ("cancelled", "completed"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot join a {e.status} event",
        )

    # Private events have no invite flow yet, so an outsider with the
    # ID must not be able to bypass the detail-side 404 by joining
    # first. Mirror get_event's hide-as-404 behavior. Host is the only
    # member of a freshly-seeded private event, so we don't need to
    # check the participant table here.
    if e.visibility == "private" and current_user_id != e.host_user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
        )

    if await _active_participant(db, e.id, current_user_id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already joined this event",
        )

    count = await _joined_count(db, e.id)
    if count >= e.capacity or e.status == "full":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Event is full",
        )

    # Re-activate a prior "left" row if the user is rejoining — keeps
    # the soft-leave audit trail honest (we don't create duplicate
    # joined rows for the same user on the same event).
    rejoin_stmt = select(EventParticipant).where(
        EventParticipant.event_id == e.id,
        EventParticipant.user_id == current_user_id,
        EventParticipant.status == "left",
    )
    prior = (await db.execute(rejoin_stmt)).scalars().first()
    if prior is not None:
        prior.status = "joined"
        prior.left_at = None
        prior.joined_at = datetime.now(tz=timezone.utc)
    else:
        db.add(
            EventParticipant(
                event_id=e.id,
                user_id=current_user_id,
                status="joined",
            )
        )

    new_count = count + 1
    if new_count >= e.capacity:
        e.status = "full"
    await db.flush()
    await db.commit()
    await db.refresh(e)
    return await get_event(db, e.id, current_user_id)


async def leave_event(
    db: AsyncSession, event_id: UUID, current_user_id: UUID
) -> EventDetail:
    locked_stmt = select(Event).where(Event.id == event_id).with_for_update()
    e = (await db.execute(locked_stmt)).scalar_one_or_none()
    if e is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
        )

    if e.status not in _LEAVABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot leave a {e.status} event",
        )

    # Host cannot orphan their own event. Cancel/transfer-host is a
    # future stream; until then, leaving must go through the host. This
    # check sits BEFORE the participant lookup so the response is the
    # same whether or not the host was auto-joined.
    if current_user_id == e.host_user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Host cannot leave their own event",
        )

    participant = await _active_participant(db, e.id, current_user_id)
    if participant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not in this event",
        )

    # Soft leave — preserves the audit trail for the future no-show /
    # attendance stream. Status flips to "left" rather than deleting.
    participant.status = "left"
    participant.left_at = datetime.now(tz=timezone.utc)
    await db.flush()

    new_count = await _joined_count(db, e.id)
    if e.status == "full" and new_count < e.capacity:
        e.status = "open"

    await db.commit()
    await db.refresh(e)
    return await get_event(db, e.id, current_user_id)
