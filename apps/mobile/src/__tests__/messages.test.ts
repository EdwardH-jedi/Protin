/**
 * dedupeMessagesById unit tests — pure helper, no RN harness needed.
 */

import { dedupeMessagesById } from '../lib/messages';

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
