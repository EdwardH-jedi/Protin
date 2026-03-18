/**
 * Google Calendar integration types.
 *
 * Connection flow (mobile-initiated):
 *   1. GET /users/me/google-calendar/auth-url → {url}
 *   2. Mobile opens url in expo-web-browser (openAuthSessionAsync)
 *   3. GET /users/me/google-calendar/status → GoogleCalendarStatus
 *
 * Sync:
 *   POST /bookings/{id}/sync-google-calendar (only confirmed bookings)
 */

import type { ISODateString, UUID } from './common';

export interface GoogleCalendarStatus {
  connected: boolean;
  calendarId?: string;
  connectedAt?: ISODateString;
}

export interface SyncBookingResponse {
  bookingId: UUID;
  googleEventId: string;
  syncStatus: 'synced' | 'failed' | 'cancelled';
}
