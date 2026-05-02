from __future__ import annotations

from pydantic import BaseModel


class SportRankSummary(BaseModel):
    sport: str
    rank_points: int
    tier: str  # Rookie | Bronze | Silver | Gold | Platinum | Diamond
    sessions_completed: int


class RankSummary(BaseModel):
    """
    Public-safe Sports Reputation summary.

    Same shape for self and for other users — we deliberately do NOT
    expose raw event rows or the breakdown by negative-honor reason.
    The `honor` integer is bounded (0..200) and the per-sport summary
    only counts positive activity (completed sessions). Moderation data
    is never surfaced.
    """

    honor: int
    sports: list[SportRankSummary]
