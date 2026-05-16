/**
 * Tests for the Challenge API client thin wrapper.
 *
 * We mock the underlying ``api`` module so we can assert on exact
 * endpoint paths and request bodies the wrapper builds — these are
 * the bits that have to stay in sync with the backend route + payload
 * contracts.
 */

import {
  acceptChallenge,
  cancelChallenge,
  CHALLENGE_TERMINAL_STATUSES,
  createChallenge,
  declineChallenge,
  getChallenge,
  isChallengeTerminal,
  listChallenges,
  submitChallengeResult,
} from '../lib/challenges';

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe('challenges api client', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('listChallenges with no params hits /challenges', async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });
    const out = await listChallenges();
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/challenges');
    expect(out).toEqual({ items: [], total: 0 });
  });

  it('listChallenges encodes status, limit and offset into the query string', async () => {
    mockGet.mockResolvedValueOnce({ items: [], total: 0 });
    await listChallenges({ status: 'pending', limit: 25, offset: 50 });
    expect(mockGet).toHaveBeenCalledWith(
      '/challenges?status=pending&limit=25&offset=50'
    );
  });

  it('getChallenge hits /challenges/{id}', async () => {
    mockGet.mockResolvedValueOnce({ id: 'c1' });
    await getChallenge('c1');
    expect(mockGet).toHaveBeenCalledWith('/challenges/c1');
  });

  it('createChallenge posts the camelCase body verbatim (api transforms snake_case)', async () => {
    mockPost.mockResolvedValueOnce({ id: 'new' });
    const body = {
      opponentUserId: 'u2',
      sport: 'tennis',
      area: 'Bondi',
      note: 'wanna play?',
    };
    await createChallenge(body);
    expect(mockPost).toHaveBeenCalledWith('/challenges', body);
  });

  it('acceptChallenge / declineChallenge / cancelChallenge post to the right action paths with no body', async () => {
    mockPost.mockResolvedValue({ id: 'c1' });
    await acceptChallenge('c1');
    await declineChallenge('c1');
    await cancelChallenge('c1');
    expect(mockPost.mock.calls[0]).toEqual(['/challenges/c1/accept']);
    expect(mockPost.mock.calls[1]).toEqual(['/challenges/c1/decline']);
    expect(mockPost.mock.calls[2]).toEqual(['/challenges/c1/cancel']);
  });

  it('submitChallengeResult posts winner/loser ids to /challenges/{id}/result', async () => {
    mockPost.mockResolvedValueOnce({ id: 'c1', status: 'accepted' });
    await submitChallengeResult('c1', {
      winnerUserId: 'u1',
      loserUserId: 'u2',
    });
    expect(mockPost).toHaveBeenCalledWith('/challenges/c1/result', {
      winnerUserId: 'u1',
      loserUserId: 'u2',
    });
  });

  it('isChallengeTerminal matches the documented terminal set', () => {
    expect(isChallengeTerminal('pending')).toBe(false);
    expect(isChallengeTerminal('accepted')).toBe(false);
    expect(isChallengeTerminal('verified')).toBe(true);
    expect(isChallengeTerminal('disputed')).toBe(true);
    expect(isChallengeTerminal('declined')).toBe(true);
    expect(isChallengeTerminal('cancelled')).toBe(true);
    // Defensive: terminal list cannot include pending or accepted.
    expect(CHALLENGE_TERMINAL_STATUSES).not.toContain('pending');
    expect(CHALLENGE_TERMINAL_STATUSES).not.toContain('accepted');
  });
});
