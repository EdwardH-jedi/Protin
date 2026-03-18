/**
 * Match domain types.
 *
 * A Match is created when two users mutually like each other for the same sport.
 * It is a real entity (stored in DB), not a view.
 * Canonical pair: user1Id < user2Id (lexicographic) to prevent duplicates.
 */

import type { ISODateString, Paginated, UUID } from './common';
import type { Sport } from './sport-profile';
import type { PartnerCard } from './discovery';

// ---------------------------------------------------------------------------
// Match status
// ---------------------------------------------------------------------------

export type MatchStatus = 'active' | 'archived';

// ---------------------------------------------------------------------------
// Match entity
// ---------------------------------------------------------------------------

/**
 * Match as returned by GET /matches and PATCH /matches/:id.
 *
 * Note: user1_id and user2_id are stored in the DB (canonical pair, user1Id < user2Id)
 * but are NOT included in the API response. The API always returns the enriched
 * MatchWithPartner shape (partner is always present). This base type exists only
 * for type composition; mobile consumers should use MatchWithPartner.
 */
export interface Match {
  id: UUID;
  sport: Sport;
  status: MatchStatus;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Enriched response
// ---------------------------------------------------------------------------

/**
 * Match as seen by a participant — includes the other user's profile card.
 */
export interface MatchWithPartner extends Match {
  partner: PartnerCard;
}

export type MatchListResponse = Paginated<MatchWithPartner>;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface ArchiveMatchRequest {
  reason?: string;
}
