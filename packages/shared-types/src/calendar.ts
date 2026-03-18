/**
 * Calendar domain types — FUTURE SCOPE, not yet implemented in the API.
 *
 * These types are placeholders for potential future availability scheduling.
 * The only implemented calendar feature is Google Calendar sync, which is
 * covered by google-calendar.ts.
 *
 * Do not use these types in mobile screens until the corresponding API
 * endpoints exist.
 */

import type { ISODateString, Timezone, UUID } from './common';

// ---------------------------------------------------------------------------
// Availability windows (trainer-side, recurring)
// ---------------------------------------------------------------------------

/**
 * A recurring weekly availability block — future scope.
 *
 * Times are stored in the user's declared timezone to correctly handle DST.
 * dayOfWeek follows the JavaScript convention: 0 = Sunday, 6 = Saturday.
 */
export interface AvailabilityWindow {
  id: UUID;
  userId: UUID;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Start time in HH:MM format (24-hour). Example: "09:00" */
  startTime: string;
  /** End time in HH:MM format (24-hour). Example: "17:00" */
  endTime: string;
  timezone: Timezone;
  /** Session length in minutes. Used to slice the window into bookable slots. */
  slotDurationMinutes: number;
  /** Buffer between slots in minutes (prevents back-to-back sessions). */
  bufferMinutes: number;
}

export interface CreateAvailabilityWindowRequest {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  timezone: Timezone;
  slotDurationMinutes: number;
  bufferMinutes?: number;
}

// ---------------------------------------------------------------------------
// Calendar slots (read — availability view)
// ---------------------------------------------------------------------------

/**
 * A single time slot as seen when browsing availability.
 * Future scope — no API endpoint currently exists for this.
 */
export interface CalendarSlot {
  startsAt: ISODateString;
  endsAt: ISODateString;
  /** false if already booked, true if still open. */
  isAvailable: boolean;
}

// ---------------------------------------------------------------------------
// External calendar sync
// ---------------------------------------------------------------------------

export type CalendarProvider = 'google' | 'apple' | 'outlook';

/**
 * Request body for initiating an OAuth-based calendar sync.
 * The `authCode` is obtained from the provider's OAuth consent screen.
 */
export interface CalendarSyncRequest {
  provider: CalendarProvider;
  /** OAuth authorization code from the provider's consent flow. */
  authCode: string;
}

/**
 * Sync status returned by GET /calendar/sync-status.
 */
export interface CalendarSyncStatus {
  provider: CalendarProvider;
  synced: boolean;
  lastSyncedAt?: ISODateString;
  /** The name of the calendar being synced, as returned by the provider. */
  calendarName?: string;
}

/**
 * Payload for exporting a confirmed booking to a client's personal calendar.
 * Sent as a calendar invite via the provider's API.
 */
export interface CalendarExportRequest {
  bookingId: UUID;
  provider: CalendarProvider;
}
