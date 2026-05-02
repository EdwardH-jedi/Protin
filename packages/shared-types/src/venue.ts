/**
 * Venue / Nearby Courts domain types.
 *
 * Venues are a static, server-side catalog (seeded from JSON) used to give
 * users a structured way to attach a court / gym / running spot to a session
 * proposal. Unlike user profiles, venues are read-only from the mobile app
 * in V2.0.
 */

import type { ISODateString, UUID } from './common';
import type { Sport } from './sport-profile';

export interface Venue {
  id: UUID;
  name: string;
  /** Sports this venue serves. A single venue can support multiple sports. */
  sportTags: Sport[];
  area?: string;
  address?: string;
  latitude: number;
  longitude: number;
  /** Only present when the venue has a real booking surface to link to. */
  bookingUrl?: string;
  notes?: string;
  /** True ONLY when bookingUrl leads to a real booking experience. */
  isBookable: boolean;
  /** Distance from the query lat/lng in km. Null when no coordinates were supplied. */
  distanceKm?: number | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface NearbyVenuesResponse {
  items: Venue[];
  total: number;
}

export interface NearbyVenuesQuery {
  sport: Sport;
  /** Provide both lat and lng or neither. */
  lat?: number;
  lng?: number;
  limit?: number;
}
