/**
 * useUserHonorSummary tests
 *
 * Covers the session cache: a list with M unique host IDs must
 * produce at most M /rank/users/{id} requests across all consumers.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useUserHonorSummary } from '../hooks/useUserHonorSummary';
import { _resetUserHonorSummaryCache } from '../lib/rank';

const mockApiGet = jest.fn();
jest.mock('../lib/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

const SUMMARY = {
  userId: 'host-1',
  honorScore: 126,
  honorLevel: 'Trusted',
  gangScore: 30,
  completedGamesCount: 5,
  hostedGamesCount: 2,
  noShowCount: 0,
  excusedCount: 0,
  pendingCount: 0,
  sportLevels: [],
  generatedAt: '2026-05-11T00:00:00Z',
};

describe('useUserHonorSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetUserHonorSummaryCache();
  });

  it('fetches GET /rank/users/{id} on first mount', async () => {
    mockApiGet.mockResolvedValueOnce(SUMMARY);
    const { result } = renderHook(() =>
      useUserHonorSummary({ userId: 'host-1' })
    );
    await waitFor(() => {
      expect(result.current.summary).toEqual(SUMMARY);
    });
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith('/rank/users/host-1');
  });

  it('shares the cache between two consumers of the same userId', async () => {
    mockApiGet.mockResolvedValue(SUMMARY);
    const a = renderHook(() => useUserHonorSummary({ userId: 'host-1' }));
    const b = renderHook(() => useUserHonorSummary({ userId: 'host-1' }));
    await waitFor(() => {
      expect(a.result.current.summary).toEqual(SUMMARY);
      expect(b.result.current.summary).toEqual(SUMMARY);
    });
    // Cache must collapse to a single network request.
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when userId is null', async () => {
    renderHook(() => useUserHonorSummary({ userId: null }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('treats 404 as no-data, not an error', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('HTTP 404'));
    const { result } = renderHook(() =>
      useUserHonorSummary({ userId: 'ghost' })
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('surfaces non-404 errors', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Network down'));
    const { result } = renderHook(() =>
      useUserHonorSummary({ userId: 'host-x' })
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBe('Network down');
  });
});
