/**
 * Rank API client tests — confirms /rank/me and /rank/users/{id} calls.
 */

import { getMyHonorSummary, getUserHonorSummary } from '../lib/rank';

const mockGet = jest.fn();
jest.mock('../lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

describe('rank API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getMyHonorSummary calls GET /rank/me', async () => {
    mockGet.mockResolvedValueOnce({ honorScore: 102 });
    const out = await getMyHonorSummary();
    expect(mockGet).toHaveBeenCalledWith('/rank/me');
    expect(out).toEqual({ honorScore: 102 });
  });

  it('getUserHonorSummary calls GET /rank/users/{id}', async () => {
    mockGet.mockResolvedValueOnce({ honorScore: 88 });
    await getUserHonorSummary('user-xyz');
    expect(mockGet).toHaveBeenCalledWith('/rank/users/user-xyz');
  });
});
