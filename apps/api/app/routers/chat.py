from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.schemas.chat import MessageListResponse, MessageResponse, SendMessageRequest
from app.services import chat as chat_service

router = APIRouter(tags=["chat"])


@router.get("/matches/{match_id}/messages", response_model=MessageListResponse)
async def list_messages(
    match_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageListResponse:
    return await chat_service.list_messages(db, match_id, current_user.id, limit, offset)


@router.post("/matches/{match_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    match_id: UUID,
    body: SendMessageRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    return await chat_service.send_message(db, match_id, current_user.id, body.body)
