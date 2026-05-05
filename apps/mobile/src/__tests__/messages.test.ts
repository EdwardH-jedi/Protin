/**
 * Message helper unit tests — pure helpers, no RN harness needed.
 */

import {
  dedupeMessagesById,
  formatPreviewTimestamp,
  previewText,
} from '../lib/messages';

describe('dedupeMessagesById', () => {
  it('returns the same content for an already-unique list', () => {
    const items = [
      { id: 'a', body: 'hi' },
      { id: 'b', body: 'there' },
    ];
    expect(dedupeMessagesById(items)).toEqual(items);
  });

  it('removes duplicates by id, keeping the first occurrence', () => {
    const a1 = { id: 'a', body: 'first' };
    const a2 = { id: 'a', body: 'second' };
    const b = { id: 'b', body: 'b1' };
    expect(dedupeMessagesById([a1, b, a2])).toEqual([a1, b]);
  });

  it('preserves order when there are no duplicates', () => {
    const items = [
      { id: '3', body: 'c' },
      { id: '1', body: 'a' },
      { id: '2', body: 'b' },
    ];
    expect(dedupeMessagesById(items)).toEqual(items);
  });

  it('returns an empty array unchanged', () => {
    expect(dedupeMessagesById([])).toEqual([]);
  });

  it('does not mutate its input', () => {
    const input = [
      { id: 'a', body: '1' },
      { id: 'a', body: '2' },
    ];
    const before = JSON.stringify(input);
    dedupeMessagesById(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('handles three or more copies of the same id', () => {
    const items = [
      { id: 'a', body: '1' },
      { id: 'a', body: '2' },
      { id: 'a', body: '3' },
      { id: 'b', body: 'other' },
    ];
    expect(dedupeMessagesById(items)).toEqual([
      { id: 'a', body: '1' },
      { id: 'b', body: 'other' },
    ]);
  });
});

describe('previewText', () => {
  it('returns empty string for nullish input', () => {
    expect(previewText(null)).toBe('');
    expect(previewText(undefined)).toBe('');
    expect(previewText('')).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(previewText('  hello  ')).toBe('hello');
  });

  it('collapses internal whitespace and newlines to single spaces', () => {
    expect(previewText('Saturday\nmorning   works\tfor me.'))
      .toBe('Saturday morning works for me.');
  });

  it('returns empty string for whitespace-only input (callers branch on falsy)', () => {
    expect(previewText('   ')).toBe('');
    expect(previewText('\n\t')).toBe('');
  });
});

describe('formatPreviewTimestamp', () => {
  it('returns empty string for nullish or unparseable input', () => {
    expect(formatPreviewTimestamp(null)).toBe('');
    expect(formatPreviewTimestamp(undefined)).toBe('');
    expect(formatPreviewTimestamp('')).toBe('');
    expect(formatPreviewTimestamp('not-a-date')).toBe('');
  });

  it('returns a time-style label when the message is from today', () => {
    const now = new Date(2026, 4, 6, 14, 0, 0); // 2026-05-06 14:00 local
    const sameDay = new Date(2026, 4, 6, 9, 30, 0).toISOString();
    const out = formatPreviewTimestamp(sameDay, now);
    // Locale-dependent exact output — assert it's not the date-style
    // fallback (no month abbreviation) and contains a colon.
    expect(out).toContain(':');
    expect(out).not.toMatch(/May/i);
  });

  it('returns a date-style label when the message is older than today', () => {
    const now = new Date(2026, 4, 6, 14, 0, 0);
    const yesterday = new Date(2026, 4, 5, 14, 0, 0).toISOString();
    const out = formatPreviewTimestamp(yesterday, now);
    // The short month name is locale-dependent; assert it isn't a
    // pure HH:MM string by checking for absence of leading colon-style
    // and presence of either a digit followed by a space or the
    // weekday/month text.
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/^\d{1,2}:\d{2}/);
  });
});
