/**
 * Venue / Nearby Courts domain types.
 *
 * Venues are a static, server-side catalog (seeded from JSON) used to give
 * users a structured way to attach a court / gym / running spot to a session
 * proposal. Unlike user profiles, venues are read-only from the mobile app
 * in V2.0.
 */

import type { ISODateString, UUID } from './common';

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
  sportTags: string[];
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
  /**
   * Google Places (New) primary type, e.g. "tennis_court", "gym",
   * "golf_course". Echoes Google's classification so the picker can
   * label rows beyond the requested sport. Optional / undefined on
   * seed rows.
   */
  primaryType?: string | null;
  /**
   * Deep link into the Google Maps app/web for the underlying place.
   * Populated only on Places-sourced rows. The mobile picker uses this
   * for a "View in Google Maps" affordance per the terms-of-service
   * expectation when surfacing Places content.
   */
  googleMapsUri?: string | null;
  /**
   * HTML attribution snippets returned by Google alongside a Places
   * row. When non-empty these MUST be rendered near the venue (in
   * addition to the global "Powered by Google" chip). Empty / undefined
   * for seed rows.
   */
  attributions?: string[];
  /**
   * Advisory match confidence vs the requested sport.
   *
   *  - `"high"`   : Google's primary_type / types / name strongly match
   *                 the sport. Curated seed rows also default to high.
   *  - `"medium"` : generic sports infrastructure (park, stadium,
   *                 sports complex, gym) without a sport-specific hit.
   *  - `"low"`    : weak match — still potentially useful so the
   *                 picker looks alive in sparse areas.
   *
   * Optional so a v1.0 backend that omits the field still type-checks;
   * treat absence as `"medium"`.
   */
  confidence?: VenueConfidence;
}

/**
 * Advisory per-row match confidence emitted by the backend. The picker
 * may use it to rank or fade rows but must NOT filter on it — sparse
 * areas would otherwise look empty.
 */
export type VenueConfidence = 'high' | 'medium' | 'low';

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

/**
 * Coarse status of the Google Places provider on a /venues/nearby
 * response. Designed so the mobile picker can render a single,
 * non-leaky message per state — raw Google errors are intentionally
 * not surfaced.
 *
 *  - "ok"                  : provider was called successfully (results
 *                            may be 0 — that is not an error).
 *  - "disabled"            : provider was not consulted. Either the
 *                            request used source="seed", or the API key
 *                            is not configured server-side.
 *  - "missing_coordinates" : the request shape required a provider call
 *                            but lat/lng were absent, so no call was
 *                            made.
 *  - "quota_exceeded"      : Google returned 429 (or equivalent) and
 *                            the response is falling back to seed only.
 *  - "error"               : timeout, non-2xx, malformed payload, or
 *                            any other provider failure. Falls back to
 *                            seed.
 */
export type VenueProviderStatus =
  | 'ok'
  | 'disabled'
  | 'missing_coordinates'
  | 'quota_exceeded'
  | 'error';

export interface NearbyVenuesResponse {
  items: Venue[];
  total: number;
  /**
   * Coarse provider status — see {@link VenueProviderStatus}. Defaults
   * to "disabled" when the server omits the field so old v1.0 clients
   * are byte-compatible.
   */
  providerStatus?: VenueProviderStatus;
  /**
   * Opaque cursor for the next page. Populated only when the Google
   * Places (Text Search) response surfaced a ``nextPageToken``. Mobile
   * should pass it back as ``cursor=<value>`` on the next /venues/nearby
   * request to fetch the next page. Null / undefined when there is no
   * next page.
   */
  nextCursor?: string | null;
}

/**
 * Lazy-load Google Place Details response. Fetched only when the user
 * opens a Google-Places-sourced venue from the picker — never during
 * list/search. The mobile picker calls `GET /venues/places/{place_id}`
 * with either the raw Google id (`ChIJ…`) or the fully-qualified
 * resource name (`places/ChIJ…`); the backend accepts either form.
 *
 * Surface contract:
 *  - 200 with this body when Google returned a well-formed payload.
 *  - 503 when the server-side Places key is unset or quota was exceeded.
 *  - 502 when the provider timed out or returned a malformed payload.
 *
 * `attributionRequired` is always true on this endpoint — the picker
 * should render "Powered by Google" alongside any rendered detail.
 */
export interface PlaceDetailsResponse {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  types?: string[];
  primaryType?: string | null;
  googleMapsUri?: string | null;
  websiteUri?: string | null;
  nationalPhoneNumber?: string | null;
  internationalPhoneNumber?: string | null;
  businessStatus?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  /** Weekday-formatted opening hours, e.g. "Monday: 6:00 AM - 10:00 PM". */
  openingHours?: string[];
  /** HTML attribution snippets that must be rendered alongside the detail. */
  attributions?: string[];
  /** Always true for this endpoint — kept for symmetry with Venue rows. */
  attributionRequired: boolean;
}

export interface NearbyVenuesQuery {
  sport: string;
  /** Provide both lat and lng or neither. */
  lat?: number;
  lng?: number;
  limit?: number;
  source?: VenueSourceMode;
  /**
   * Free-text user query. When present, the backend routes it through
   * Google Places Text Search instead of the default sport-based phrase
   * (e.g. "Bondi tennis"). The sport filter still applies to local seed
   * rows.
   */
  q?: string;
  /**
   * Opaque pagination cursor returned by a previous call as
   * ``nextCursor``. Forwarded to Google Places Text Search as a
   * ``pageToken`` to fetch the next page of results.
   */
  cursor?: string;
  /** Search radius in km (1–50). Defaults to 10 server-side. */
  radiusKm?: number;
}
