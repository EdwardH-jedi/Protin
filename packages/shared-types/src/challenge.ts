/**
 * Sports Challenge / Verified Result domain types.
 *
 * A Challenge is a 1-on-1 invitation between two users. Only when both
 * participants submit matching results does the challenge transition to
 * ``verified`` and feed the Honor / Rank pipeline server-side. The
 * mobile app never mutates rank/honor directly — every action goes
 * through ``/challenges`` and the backend gates the side effects.
 *
 * Field shapes are camelCase here because ``apps/mobile/src/lib/api.ts``
 * auto-transforms snake_case responses to camelCase before they reach
 * any consumer.
 */

import type { ISODateString, UUID } from './common';

/**
 * Lifecycle status for a challenge.
 *
 *  - ``pending``   : created by challenger; opponent has not yet acted
 *  - ``accepted``  : opponent accepted; result submissions now allowed
 *  - ``declined``  : opponent declined while pending (terminal)
 *  - ``cancelled`` : challenger cancelled while pending (terminal)
 *  - ``verified``  : both participants submitted matching results;
 *                    Honor / Rank applied exactly once (terminal)
 *  - ``disputed``  : participants submitted conflicting results;
 *                    Honor / Rank never applied (terminal)
 */
export type ChallengeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'verified'
  | 'disputed';

export interface ChallengeRead {
  id: UUID;
  challengerUserId: UUID;
  opponentUserId: UUID;
  sport: string;
  area: string;
  status: ChallengeStatus;
  note: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  acceptedAt: ISODateString | null;
  completedAt: ISODateString | null;
  verifiedAt: ISODateString | null;
  expiresAt: ISODateString | null;
}

export interface ChallengeListResponse {
  items: ChallengeRead[];
  total: number;
}

export interface CreateChallengeRequest {
  opponentUserId: UUID;
  sport: string;
  area: string;
  note?: string | null;
}

/**
 * Body for ``POST /challenges/{id}/result``. ``submittedByUserId`` is
 * always the authenticated caller server-side; clients never pass it.
 */
export interface SubmitChallengeResultRequest {
  winnerUserId: UUID;
  loserUserId: UUID;
}
