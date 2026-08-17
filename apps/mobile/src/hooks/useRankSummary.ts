import { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';
import type { RankSummary } from '@sportsgang/shared-types';

interface UseRankSummaryArgs {
  /** Omit / null = self (`/users/me/rank-summary`). Otherwise fetch the public summary. */
  userId?: string | null;
  /** Set false to skip the fetch entirely (e.g. before a modal opens). */
  enabled?: boolean;
}

interface UseRankSummaryResult {
  summary: RankSummary | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches the Sports Reputation summary for the current user (default) or
 * for a given userId (public-safe summary).
 *
 * Treats a 404 / "not found" as "no data yet" rather than a hard error so
 * the UI can render a friendly empty state instead of a banner.
 */
export function useRankSummary({
  userId,
  enabled = true,
}: UseRankSummaryArgs = {}): UseRankSummaryResult {
  const [summary, setSummary] = useState<RankSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const path = userId ? `/users/${userId}/rank-summary` : '/users/me/rank-summary';
      const data = await api.get<RankSummary>(path);
      setSummary(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // Server returns 404 for unknown users; treat as no-data rather than
      // an error so the caller can show its empty state.
      if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        setSummary(null);
      } else {
        setError(msg || 'Could not load reputation.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId, enabled]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return { summary, isLoading, error, refresh: fetchSummary };
}
