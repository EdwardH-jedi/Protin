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

/**
 * Provenance marker on each venue row. v1.0 / Stream 0 callers only ever
 * see "seed" (or undefined — backend can omit the field). v1.1 / Stream 2
 * adds "google_places" for rows synthesised from the backend Google Places
 * provider. Mobile must NEVER call Google Places directly.
 */
export type VenueSourceTag = 'seed' | 'google_places';

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
  // ── v1.1 optional fields (Stream 2 backend, Stream 3 mobile) ─────────
  /**
   * Provenance of this row. Optional so a v1.0 backend that doesn't emit
   * the field still type-checks. Treat absence as "seed".
   */
  source?: VenueSourceTag;
  /**
   * Opaque Google Places id (e.g. "places/ChIJ…"). Populated only when
   * source === "google_places". Mobile uses this purely as an identity
   * key — no Google API call is ever made from the device.
   */
  providerPlaceId?: string | null;
  /**
   * True when displaying this row requires the "Powered by Google"
   * attribution chip per Google Places terms. Always true for
   * google_places rows; false / undefined for seed rows.
   */
  attributionRequired?: boolean;
}

/**
 * Source-mode query for /venues/nearby. v1.0 callers omit the field and
 * the backend defaults to "seed".
 *
 *  - "seed"  : local Sydney catalog only (v1.0 behaviour)
 *  - "places": Google Places only (provider must be configured + coords
 *              required; otherwise returns empty)
 *  - "both"  : seed first, then Places, deduplicated server-side
 */
export type VenueSourceMode = 'seed' | 'places' | 'both';

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
  source?: VenueSourceMode;
}
