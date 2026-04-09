from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Message
from app.models.match import Match
from app.schemas.chat import MessageListResponse, MessageResponse


async def _assert_participant(db: AsyncSession, match_id: UUID, user_id: UUID) -> Match:
    stmt = select(Match).where(Match.id == match_id)
    m = (await db.execute(stmt)).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    if m.user1_id != user_id and m.user2_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")
    return m


async def list_messages(
    db: AsyncSession,
    match_id: UUID,
    current_user_id: UUID,
    limit: int = 50,
    offset: int = 0,
) -> MessageListResponse:
    await _assert_participant(db, match_id, current_user_id)

    stmt = (
        select(Message)
        .where(Message.match_id == match_id)
        .order_by(Message.created_at.asc())
        .offset(offset)
        .limit(limit)
    )
    messages = list((await db.execute(stmt)).scalars().all())

    count_stmt = select(func.count()).select_from(Message).where(Message.match_id == match_id)
    total: int = (await db.execute(count_stmt)).scalar_one()

    return MessageListResponse(
        items=[MessageResponse.model_validate(msg) for msg in messages],
        total=total,
        limit=limit,
        offset=offset,
    )


async def send_message(
    db: AsyncSession,
    match_id: UUID,
    sender_id: UUID,
    body: str,
) -> MessageResponse:
    await _assert_participant(db, match_id, sender_id)

    msg = Message(match_id=match_id, sender_id=sender_id, body=body)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return MessageResponse.model_validate(msg)
