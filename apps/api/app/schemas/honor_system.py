from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RankProfileRead(BaseModel):
    """
    A user's aggregate rank state in a single (sport, area).

    ``id``, ``created_at``, and ``updated_at`` are nullable to support
    the non-persisted default returned by ``GET /rankings/me`` for a
    brand-new user — that endpoint is read-only and must not create a
    row, so the response has no DB-assigned identifiers to surface. A
    persisted profile always has all three populated.
    """

    id: UUID | None
    user_id: UUID
    sport: str
    area: str
    rating: int
    wins: int
    losses: int
    streak: int
    last_played_at: datetime | None
    created_at: datetime | None
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class RankingEntry(BaseModel):
    """One row of a leaderboard. ``rank`` is 1-based, dense."""

    rank: int
    user_id: UUID
    rating: int
    wins: int
    losses: int
    streak: int


class RankingListResponse(BaseModel):
    sport: str
    area: str
    items: list[RankingEntry]
    total: int


class HonorTitleRead(BaseModel):
    id: UUID
    sport: str
    area: str
    title_name: str
    current_holder_user_id: UUID | None
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HonorHistoryRead(BaseModel):
    id: UUID
    honor_title_id: UUID
    previous_holder_user_id: UUID | None
    new_holder_user_id: UUID
    source_match_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class HonorTransferResponse(BaseModel):
    """
    Return type of
    :func:`app.services.honor_system.record_match_result_for_honor`.

    Includes both rank-profile updates so the caller can refresh local
    state in one round-trip, the current honor title state, and a
    ``transferred`` flag indicating whether the title moved in this
    call. ``history_entry`` is populated only when a transfer occurred
    (initial award or holder swap).

    Used by the service layer and by the future verified-result hook.
    Intentionally not exposed via a public POST today — see
    :mod:`app.routers.honor_system` for the rationale.
    """

    winner_profile: RankProfileRead
    loser_profile: RankProfileRead
    honor_title: HonorTitleRead
    transferred: bool
    history_entry: HonorHistoryRead | None
