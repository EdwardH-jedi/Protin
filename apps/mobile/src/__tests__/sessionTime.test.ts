/**
 * sessionTime helpers — pure-function tests.
 *
 * Focus: validation rules, default-value math, and backend-error mapping.
 * UI-level interaction tests live in BookingComposerScreen.test.tsx.
 */

import {
  combineToLocalDate,
  computeValidationError,
  dateOptions,
  defaultDate,
  defaultStartTime,
  mapBackendError,
  plusOneHour,
  timeOptions,
  toDateString,
  TIME_INCREMENT_MINUTES,
} from '../lib/sessionTime';

describe('toDateString', () => {
  it('formats local-time year/month/day with zero padding', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('combineToLocalDate', () => {
  it('parses date + time into a local Date', () => {
    const d = combineToLocalDate('2026-06-01', '09:30');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // 0-indexed
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });
});

describe('plusOneHour', () => {
  it('adds 60 minutes for typical times', () => {
    expect(plusOneHour('09:00')).toBe('10:00');
    expect(plusOneHour('22:30')).toBe('23:30');
  });
  it('clamps to 23:45 to keep the session same-day', () => {
    expect(plusOneHour('23:00')).toBe('23:45');
    expect(plusOneHour('23:30')).toBe('23:45');
  });
});

describe('defaultDate', () => {
  it('returns tomorrow in local time', () => {
    const now = new Date(2026, 5, 1, 14, 0, 0); // 2026-06-01 14:00 local
    expect(defaultDate(now)).toBe('2026-06-02');
  });
  it('rolls month boundary correctly', () => {
    const now = new Date(2026, 0, 31, 14, 0, 0); // 2026-01-31
    expect(defaultDate(now)).toBe('2026-02-01');
  });
});

describe('dateOptions', () => {
  it('returns today + N days inclusive', () => {
    const now = new Date(2026, 5, 1, 14, 0, 0);
    const opts = dateOptions(now, 3);
    expect(opts).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04']);
  });
});

describe('timeOptions', () => {
  it('emits 24h * 4 slots at 15-minute increments by default', () => {
    const opts = timeOptions();
    expect(opts.length).toBe((24 * 60) / TIME_INCREMENT_MINUTES);
    expect(opts[0]).toBe('00:00');
    expect(opts[opts.length - 1]).toBe('23:45');
  });
  it('respects a custom increment', () => {
    expect(timeOptions(60).length).toBe(24);
    expect(timeOptions(30).length).toBe(48);
  });
});

describe('computeValidationError', () => {
  // Use a far-future date so "today / past-time" rules don't get triggered.
  const futureDate = '2099-06-01';

  it('returns null for a valid 1-hour session', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '10:00',
      })
    ).toBeNull();
  });

  it('returns the end-after-start message when end <= start', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '08:00',
      })
    ).toBe('End time must be later than start time.');
  });

  it('rejects the same start/end pair (zero-length session)', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '09:00',
      })
    ).toBe('End time must be later than start time.');
  });

  it('rejects sessions shorter than 30 minutes', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '09:15',
      })
    ).toBe('Sessions must be at least 30 minutes long.');
  });

  it('accepts a 30-minute session at the boundary', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '09:30',
      })
    ).toBeNull();
  });

  it('rejects sessions longer than 4 hours', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '13:30',
      })
    ).toBe('Sessions can be up to 4 hours long.');
  });

  it('accepts a 4-hour session at the boundary', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '13:00',
      })
    ).toBeNull();
  });

  it('rejects a today + past-time start with a friendly message', () => {
    const now = new Date(2026, 5, 1, 14, 0, 0); // 2026-06-01 14:00 local
    expect(
      computeValidationError({
        date: '2026-06-01',
        startTime: '09:00',
        endTime: '10:00',
        now,
      })
    ).toBe('Choose a future start time.');
  });

  it('accepts a today + future-time start', () => {
    const now = new Date(2026, 5, 1, 14, 0, 0);
    expect(
      computeValidationError({
        date: '2026-06-01',
        startTime: '15:00',
        endTime: '16:00',
        now,
      })
    ).toBeNull();
  });

  it('does not flag a tomorrow date as past', () => {
    const now = new Date(2026, 5, 1, 14, 0, 0);
    expect(
      computeValidationError({
        date: '2026-06-02',
        startTime: '06:00',
        endTime: '07:00',
        now,
      })
    ).toBeNull();
  });
});

describe('mapBackendError', () => {
  it('translates the canonical "starts_at past" error', () => {
    expect(mapBackendError('starts_at cannot be more than 1 hour in the past'))
      .toBe('Choose a future start time.');
  });

  it('translates "ends_at must be after starts_at"', () => {
    expect(mapBackendError('ends_at must be after starts_at'))
      .toBe('End time must be later than start time.');
  });

  it('translates an overlap error', () => {
    expect(mapBackendError('Booking overlap with existing session'))
      .toBe('You already have a session at this time.');
  });

  it('translates a venue-not-found error', () => {
    expect(mapBackendError('Venue not found'))
      .toBe("That court isn't available. Pick another or type a location.");
  });

  it('falls back to a generic message for unknown errors', () => {
    expect(mapBackendError('Internal server error 500'))
      .toBe("Couldn't propose this session. Please try again.");
  });

  it('returns the generic message for empty / null input', () => {
    expect(mapBackendError('')).toBe("Couldn't propose this session. Please try again.");
    expect(mapBackendError(null)).toBe("Couldn't propose this session. Please try again.");
    expect(mapBackendError(undefined)).toBe("Couldn't propose this session. Please try again.");
  });
});

describe('default helpers compose into a valid session', () => {
  it('default date + start + end is a 1-hour future session', () => {
    const date = defaultDate();
    const start = defaultStartTime();
    const end = plusOneHour(start);
    expect(computeValidationError({ date, startTime: start, endTime: end })).toBeNull();
  });
});
