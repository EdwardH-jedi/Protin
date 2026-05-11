from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.safety import Block, Report
from app.schemas.safety import (
    BlockListResponse,
    BlockResponse,
    CreateReportRequest,
    ReportListResponse,
    ReportResponse,
)

# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


async def create_report(
    db: AsyncSession,
    reporter_id: UUID,
    req: CreateReportRequest,
) -> ReportResponse:
    if reporter_id == req.reported_user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot report yourself.",
        )

    report = Report(
        reporter_id=reporter_id,
        reported_id=req.reported_user_id,
        reason=req.reason,
        context=req.context,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return ReportResponse.model_validate(report)


async def list_my_reports(
    db: AsyncSession,
    reporter_id: UUID,
) -> ReportListResponse:
    """Return reports created by the caller — never expose others' reports."""
    stmt = (
        select(Report)
        .where(Report.reporter_id == reporter_id)
        .order_by(Report.created_at.desc())
    )
    reports = list((await db.execute(stmt)).scalars().all())
    return ReportListResponse(
        items=[ReportResponse.model_validate(r) for r in reports],
        total=len(reports),
    )


# ---------------------------------------------------------------------------
# Blocks
# ---------------------------------------------------------------------------


async def block_user(
    db: AsyncSession,
    blocker_id: UUID,
    blocked_id: UUID,
) -> BlockResponse:
    if blocker_id == blocked_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot block yourself.",
        )

    # Idempotent: return existing block if present
    stmt = select(Block).where(and_(Block.blocker_id == blocker_id, Block.blocked_id == blocked_id))
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        return BlockResponse.model_validate(existing)

    block = Block(blocker_id=blocker_id, blocked_id=blocked_id)
    db.add(block)
    await db.commit()
    await db.refresh(block)
    return BlockResponse.model_validate(block)


async def unblock_user(
    db: AsyncSession,
    blocker_id: UUID,
    blocked_id: UUID,
) -> None:
    stmt = select(Block).where(and_(Block.blocker_id == blocker_id, Block.blocked_id == blocked_id))
    block = (await db.execute(stmt)).scalar_one_or_none()
    if block is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found.",
        )
    await db.delete(block)
    await db.commit()


async def list_blocks(
    db: AsyncSession,
    blocker_id: UUID,
) -> BlockListResponse:
    stmt = select(Block).where(Block.blocker_id == blocker_id).order_by(Block.created_at.desc())
    blocks = list((await db.execute(stmt)).scalars().all())
    return BlockListResponse(
        items=[BlockResponse.model_validate(b) for b in blocks],
        total=len(blocks),
    )
