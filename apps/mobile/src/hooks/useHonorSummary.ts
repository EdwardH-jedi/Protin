import { useCallback, useEffect, useState } from 'react';

import { getMyHonorSummary, getUserHonorSummary } from '../lib/rank';
import type { HonorSummary } from '@sportsgang/shared-types';

interface UseHonorSummaryArgs {
  /** Omit / null = self (/rank/me). Otherwise fetch public summary. */
  userId?: string | null;
  /** Set false to skip the fetch entirely. */
  enabled?: boolean;
}

interface UseHonorSummaryResult {
  summary: HonorSummary | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches the V1.1 Honor/Gang Score summary for the current user
 * (default) or for a given userId (public-safe summary).
 *
 * Treats a 404 as "no data yet" rather than a hard error so the UI
 * can render a friendly empty state.
 */
export function useHonorSummary({
  userId,
  enabled = true,
}: UseHonorSummaryArgs = {}): UseHonorSummaryResult {
  const [summary, setSummary] = useState<HonorSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = userId
        ? await getUserHonorSummary(userId)
        : await getMyHonorSummary();
      setSummary(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        setSummary(null);
      } else {
        setError(msg || 'Could not load Honor summary.');
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
