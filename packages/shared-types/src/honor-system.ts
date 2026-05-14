/**
 * Honor System (local champion titles) — read-only public API contract.
 *
 * Mirrors the backend schemas in ``apps/api/app/schemas/honor_system.py``.
 * The mobile API client auto-transforms response keys from snake_case to
 * camelCase, so the TypeScript shapes below use camelCase. Date fields
 * are ISO 8601 strings; UUID fields are string-typed UUIDs.
 *
 * Distinct from {@link ./rank.ts}, which models the legacy event-driven
 * ``/rank/me`` Honor / Gang Score summary. This module models the
 * per-(sport, area) leaderboard + champion-title surfaces used by
 * Profile's LocalRankSection.
 *
 * READ-ONLY by design — there are no mutation request types here. The
 * single backend writer is the verified challenge / tournament /
 * group-event result hook; it is not exposed to the public mobile API.
 */

import type { ISODateString, UUID } from './common';

/**
 * A user's aggregate rank state in a single (sport, area).
 *
 * ``id``, ``createdAt`` and ``updatedAt`` are nullable to support the
 * non-persisted default returned by ``GET /rankings/me`` for a
 * brand-new user — that endpoint is read-only and never inserts, so
 * the response has no DB-assigned identifiers to surface in that
 * shape. A persisted profile always has all three populated.
 *
 * ``sport`` and ``area`` are stored as freeform strings on the backend
 * (``String(30)`` / ``String(80)``) and are NOT restricted to the
 * ``Sport`` literal — the Honor System intentionally supports a wider
 * sport vocabulary than venues.
 */
export interface RankProfileRead {
  id: UUID | null;
  userId: UUID;
  sport: string;
  area: string;
  rating: number;
  wins: number;
  losses: number;
  streak: number;
  lastPlayedAt: ISODateString | null;
  createdAt: ISODateString | null;
  updatedAt: ISODateString | null;
}

/** One row of an (sport, area) leaderboard. ``rank`` is 1-based, dense. */
export interface RankingEntry {
  rank: number;
  userId: UUID;
  rating: number;
  wins: number;
  losses: number;
  streak: number;
}

export interface RankingListResponse {
  sport: string;
  area: string;
  items: RankingEntry[];
  total: number;
}

/**
 * The "{Area} {Sport} Champion" honor title for one (sport, area).
 * ``currentHolderUserId`` is null only briefly between creation and
 * the first holder assignment — in practice this surface always sees
 * a populated holder.
 */
export interface HonorTitleRead {
  id: UUID;
  sport: string;
  area: string;
  titleName: string;
  currentHolderUserId: UUID | null;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
