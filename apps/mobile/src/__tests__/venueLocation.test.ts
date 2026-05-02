/**
 * Pin the venue → location fallback chain (Codex Blocker 3).
 *
 * Used by BookingComposerScreen (POST payload) and BookingDetailScreen
 * (Add to Calendar). Backend mirrors the same chain in
 * apps/api/app/services/google_calendar.py::_resolve_event_location.
 */

import { formatVenueLocation, locationForBooking } from '../lib/venueLocation';

describe('formatVenueLocation', () => {
  it('joins name and address with an em-dash', () => {
    expect(
      formatVenueLocation({
        name: 'Tennis Court Alpha',
        address: '1 Beach Rd, Bondi NSW',
        area: 'Bondi',
      })
    ).toBe('Tennis Court Alpha — 1 Beach Rd, Bondi NSW');
  });

  it('falls back to area when address is missing', () => {
    expect(
      formatVenueLocation({
        name: 'Tennis Court Alpha',
        area: 'Bondi',
      })
    ).toBe('Tennis Court Alpha — Bondi');
  });

  it('returns just the name when neither address nor area is set', () => {
    expect(formatVenueLocation({ name: 'Tennis Court Alpha' })).toBe('Tennis Court Alpha');
  });

  it('treats whitespace-only address as missing', () => {
    expect(
      formatVenueLocation({
        name: 'Court A',
        address: '   ',
        area: 'Bondi',
      })
    ).toBe('Court A — Bondi');
  });
});

describe('locationForBooking', () => {
  it('returns the typed location when present (even if a venue is also attached)', () => {
    expect(
      locationForBooking({
        location: 'Custom override location',
        venue: { name: 'Tennis Court Alpha', area: 'Bondi' },
      })
    ).toBe('Custom override location');
  });

  it('falls back to venue-derived string when no typed location', () => {
    expect(
      locationForBooking({
        location: null,
        venue: { name: 'Tennis Court Alpha', area: 'Bondi' },
      })
    ).toBe('Tennis Court Alpha — Bondi');
  });

  it('falls back to venue-derived string when typed location is just whitespace', () => {
    expect(
      locationForBooking({
        location: '   ',
        venue: { name: 'Tennis Court Alpha', area: 'Bondi' },
      })
    ).toBe('Tennis Court Alpha — Bondi');
  });

  it('returns "" when neither typed location nor venue is present', () => {
    expect(locationForBooking({ location: null, venue: null })).toBe('');
  });
});
