from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class SportRankSummary(BaseModel):
    sport: str
    rank_points: int
    tier: str  # Rookie | Bronze | Silver | Gold | Platinum | Diamond
    sessions_completed: int


class RankSummary(BaseModel):
    """
    Public-safe Sports Reputation summary (legacy V2.0).

    Same shape for self and for other users — we deliberately do NOT
    expose raw event rows or the breakdown by negative-honor reason.
    The `honor` integer is bounded (0..200) and the per-sport summary
    only counts positive activity (completed sessions). Moderation data
    is never surfaced.
    """

    honor: int
    sports: list[SportRankSummary]


# ---------------------------------------------------------------------------
# V1.1 Honor / Gang Score — computed from events, attendance, and
# actioned safety reports. Distinct from the legacy booking-based
# RankSummary above; both endpoints coexist during the transition.
# ---------------------------------------------------------------------------

HonorLevel = Literal["Rookie", "Regular", "Trusted", "Captain", "Legend"]


class SportLevelSummary(BaseModel):
    sport: str
    xp: int
    level: int
    attended_count: int
    hosted_count: int


class HonorSummary(BaseModel):
    """
    Public-safe Honor / Gang Score summary.

    Computed from event participations, host-confirmed attendance, and
    actioned reports. Never includes raw report rows, block rows,
    attendance notes, or who reported a user.
    """

    user_id: UUID
    honor_score: int
    honor_level: HonorLevel
    gang_score: int
    completed_games_count: int
    hosted_games_count: int
    no_show_count: int
    excused_count: int
    pending_count: int
    sport_levels: list[SportLevelSummary]
    generated_at: datetime
