import { useEffect, useState } from 'react';

import { getUserHonorSummaryCached } from '../lib/rank';
import type { HonorSummary } from '@protin/shared-types';

interface UseUserHonorSummaryArgs {
  userId: string | null | undefined;
  /** Set false to skip the fetch (e.g. card not yet visible). */
  enabled?: boolean;
}

interface UseUserHonorSummaryResult {
  summary: HonorSummary | null;
  isLoading: boolean;
  /** True only on hard errors (network, 5xx). 404 collapses to summary=null. */
  error: string | null;
}

/**
 * Fetches a single user's Honor summary, sharing a session-level
 * cache so a list of N event cards with M unique hosts produces at
 * most M requests across all callers.
 *
 * Failure mode is friendly:
 *   * 404 / "not found"  → summary stays null, error stays null
 *   * Other errors        → summary stays null, error contains message
 * The consumer can render the "New player" fallback in both cases.
 */
export function useUserHonorSummary({
  userId,
  enabled = true,
}: UseUserHonorSummaryArgs): UseUserHonorSummaryResult {
  const [summary, setSummary] = useState<HonorSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setSummary(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void getUserHonorSummaryCached(userId)
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
          setSummary(null);
        } else {
          setError(msg || 'Honor unavailable');
        }
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);

  return { summary, isLoading, error };
}
