/**
 * Tournament domain types.
 *
 * Tournaments are gated behind a server-side feature flag — when the flag
 * is off, every /tournaments endpoint returns 404 and the mobile client
 * hides the entry surface (fail-open pattern). No client-side flag exists.
 */

import type { ISODateString, UUID } from './common';
import type { Sport } from './sport-profile';

export type TournamentStatus =
  | 'draft'
  | 'open'
  | 'full'
  | 'closed'
  | 'completed'
  | 'cancelled';

export interface TournamentSummary {
  id: UUID;
  title: string;
  sport: Sport;
  description?: string | null;
  area?: string | null;
  venueId?: UUID | null;
  startsAt: ISODateString;
  capacity: number;
  participantCount: number;
  spotsLeft: number;
  status: TournamentStatus;
  hasJoined: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface TournamentParticipantSummary {
  userId: UUID;
  displayName: string;
  joinedAt: ISODateString;
}

export interface TournamentDetail extends TournamentSummary {
  participants: TournamentParticipantSummary[];
}

export interface TournamentListResponse {
  items: TournamentSummary[];
  total: number;
}
