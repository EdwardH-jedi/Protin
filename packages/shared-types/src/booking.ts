/**
 * Booking domain types.
 *
 * Bookings are proposed directly between matched workout partners.
 * No trainer/availability slot model — two equals agree on a session.
 *
 * Status machine:
 *
 *   proposed  → confirmed  (partner accepts)
 *             → declined   (partner declines)
 *             → cancelled  (proposer withdraws)
 *
 *   confirmed → completed  (either marks done)
 *             → cancelled  (either cancels)
 *             → no_show    (either records no-show)
 */

import type { ISODateString, UUID } from './common';
import type { PartnerCard } from './discovery';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type BookingStatus =
  | 'proposed'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'no_show';

// ---------------------------------------------------------------------------
// Booking entity
// ---------------------------------------------------------------------------

export interface Booking {
  id: UUID;
  matchId: UUID;
  proposerId: UUID;
  partnerId: UUID;
  sport: 'gym' | 'golf';
  startsAt: ISODateString;
  endsAt: ISODateString;
  location?: string;
  notes?: string;
  status: BookingStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export interface CreateBookingRequest {
  matchId: UUID;
  sport: 'gym' | 'golf';
  startsAt: ISODateString;
  endsAt: ISODateString;
  location?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Query filters
// ---------------------------------------------------------------------------

/** Query filter for GET /bookings */
export type BookingStatusFilter = BookingStatus | BookingStatus[];

/** Response shape when listing bookings with a status filter.
 *  The `items` array only contains bookings matching the requested statuses. */
export interface BookingListFilter {
  statuses?: BookingStatus[];
}

// ---------------------------------------------------------------------------
// Enriched response
// ---------------------------------------------------------------------------

/**
 * Detailed booking including the partner's card.
 * To determine role: compare `proposerId` with the authenticated user's ID.
 * - proposer: can cancel (when proposed), complete/no-show/cancel (when confirmed)
 * - partner: can confirm/decline/cancel (when proposed), complete/no-show/cancel (when confirmed)
 */
export interface BookingDetail extends Booking {
  /** The other participant (partner card from the match). */
  partner: PartnerCard;
}

export interface BookingListResponse {
  items: BookingDetail[];
  total: number;
  limit: number;
  offset: number;
}
