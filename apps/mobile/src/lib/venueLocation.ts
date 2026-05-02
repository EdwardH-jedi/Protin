/**
 * Venue → display-location string.
 *
 * Used by both the booking composer (payload `location` field) and the
 * BookingDetail "Add to Calendar" path so a venue-selected booking never
 * lands as a blank-location calendar event.
 *
 * Format priority:
 *   1. address (most specific)
 *   2. area (suburb-level)
 *   3. just the venue name
 */

interface VenueLike {
  name: string;
  address?: string | null;
  area?: string | null;
}

export function formatVenueLocation(venue: VenueLike): string {
  const detail = venue.address?.trim() || venue.area?.trim() || '';
  return detail ? `${venue.name} — ${detail}` : venue.name;
}

/**
 * Resolve the "best" location string for a booking, applying the
 * fallback chain Codex flagged in Blocker 3:
 *   1. typed location (manually entered, wins over venue)
 *   2. venue-derived string (if booking has a venue attached)
 *   3. empty string
 */
export function locationForBooking(booking: {
  location?: string | null;
  venue?: VenueLike | null;
}): string {
  const typed = booking.location?.trim();
  if (typed) return typed;
  if (booking.venue) return formatVenueLocation(booking.venue);
  return '';
}
