/**
 * Event ("battle" / "game") domain types.
 *
 * Distinct from Booking (1:1 partner session) and Tournament
 * (multi-round structured competition). One host opens an event,
 * other users join up to capacity.
 */

import type { ISODateString, UUID } from './common';

export type EventMode = 'casual' | 'ranked';
export type EventVisibility = 'public' | 'private';
export type EventStatus = 'open' | 'full' | 'cancelled' | 'completed';

export interface EventHost {
  id: UUID;
  displayName: string;
}

export interface EventSummary {
  id: UUID;
  hostUserId: UUID;
  host: EventHost | null;
  title: string;
  sport: string;
  mode: EventMode;
  startsAt: ISODateString;
  locationText: string;
  capacity: number;
  participantCount: number;
  spotsLeft: number;
  visibility: EventVisibility;
  status: EventStatus;
  hasJoined: boolean;
  description: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface EventParticipantSummary {
  userId: UUID;
  displayName: string;
  joinedAt: ISODateString;
}

export interface EventDetail extends EventSummary {
  participants: EventParticipantSummary[];
}

export interface EventListResponse {
  items: EventSummary[];
  total: number;
}

export interface CreateEventRequest {
  title: string;
  sport: string;
  mode: EventMode;
  startsAt: ISODateString;
  locationText: string;
  capacity: number;
  description?: string | null;
  visibility?: EventVisibility;
}
