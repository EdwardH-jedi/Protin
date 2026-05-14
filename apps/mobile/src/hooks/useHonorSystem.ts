import { useCallback, useEffect, useState } from 'react';

import {
  getCurrentHonor,
  getMyHonors,
  getMyRank,
  type HonorTitleRead,
  type RankProfileRead,
} from '../lib/honorSystem';

interface UseHonorSystemArgs {
  sport: string;
  area: string;
  /** Set false to skip the fetch entirely. */
  enabled?: boolean;
}

interface UseHonorSystemResult {
  /** Caller's rank profile in (sport, area). Null while loading or on hard error. */
  rank: RankProfileRead | null;
  /** Current local champion for (sport, area) — null when no title is held. */
  localChampion: HonorTitleRead | null;
  /** All honor titles the caller currently holds, across all (sport, area) pairs. */
  myTitles: HonorTitleRead[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Read-only mobile hook for the Honor System / Local Champion surface.
 *
 * Fans out three calls in parallel:
 *   - GET /rankings/me?sport=&area=  → caller's rank profile
 *   - GET /honors?sport=&area=       → current local champion (nullable)
 *   - GET /honors/me                 → titles the caller currently holds
 *
 * Treats 404 as an empty state rather than an error — the backend
 * returns the default rank for a brand-new user without persisting,
 * and `null` is a valid champion response for an unclaimed area.
 *
 * No mutation paths. The Honor System is read-only by design; the only
 * legitimate writer is the verified challenge / tournament / group-event
 * result hook on the backend.
 */
export function useHonorSystem({
  sport,
  area,
  enabled = true,
}: UseHonorSystemArgs): UseHonorSystemResult {
  const [rank, setRank] = useState<RankProfileRead | null>(null);
  const [localChampion, setLocalChampion] = useState<HonorTitleRead | null>(null);
  const [myTitles, setMyTitles] = useState<HonorTitleRead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const [r, c, t] = await Promise.all([
        getMyRank(sport, area).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
            return null;
          }
          throw err;
        }),
        getCurrentHonor(sport, area).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
            return null;
          }
          throw err;
        }),
        getMyHonors().catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
            return [];
          }
          throw err;
        }),
      ]);
      setRank(r);
      setLocalChampion(c);
      setMyTitles(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Honor System data.');
    } finally {
      setIsLoading(false);
    }
  }, [sport, area, enabled]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { rank, localChampion, myTitles, isLoading, error, refresh: fetchAll };
}
