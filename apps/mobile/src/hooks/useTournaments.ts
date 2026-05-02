import { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';
import type {
  Sport,
  TournamentDetail,
  TournamentListResponse,
  TournamentSummary,
} from '@protin/shared-types';

// ---------------------------------------------------------------------------
// Module-level cache: feature-availability is fetched once per session and
// reused. Avoids one /tournaments hit per Profile mount.
// ---------------------------------------------------------------------------
let _availabilityCache: boolean | null = null;
let _availabilityInflight: Promise<boolean> | null = null;

async function _probeAvailability(): Promise<boolean> {
  if (_availabilityCache !== null) return _availabilityCache;
  if (_availabilityInflight !== null) return _availabilityInflight;
  _availabilityInflight = (async () => {
    try {
      await api.get<TournamentListResponse>('/tournaments?limit=1');
      _availabilityCache = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // 404 = feature flag off. Anything else (network, 5xx) we treat as
      // "unknown — assume available" so a transient failure doesn't hide
      // a working feature.
      if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        _availabilityCache = false;
      } else {
        _availabilityCache = true;
      }
    } finally {
      _availabilityInflight = null;
    }
    return _availabilityCache!;
  })();
  return _availabilityInflight;
}

/** Reset the in-memory availability cache (test-only). */
export function _resetTournamentsAvailabilityCache(): void {
  _availabilityCache = null;
  _availabilityInflight = null;
}

/**
 * Returns whether the Tournaments feature is reachable on this server.
 *
 * Fail-open pattern: a single GET /tournaments?limit=1 — if 404, the
 * server's feature flag is off and the UI must hide the entry surface.
 * Cached for the session.
 */
export function useTournamentsAvailable(): { available: boolean; isReady: boolean } {
  const [state, setState] = useState<{ available: boolean; isReady: boolean }>(() =>
    _availabilityCache !== null
      ? { available: _availabilityCache, isReady: true }
      : { available: false, isReady: false }
  );

  useEffect(() => {
    if (_availabilityCache !== null) {
      setState({ available: _availabilityCache, isReady: true });
      return;
    }
    let cancelled = false;
    void _probeAvailability().then((available) => {
      if (!cancelled) setState({ available, isReady: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// ---------------------------------------------------------------------------
// List + detail hooks
// ---------------------------------------------------------------------------

interface UseTournamentsArgs {
  mine?: boolean;
  sport?: Sport;
  enabled?: boolean;
}

export function useTournaments({
  mine = false,
  sport,
  enabled = true,
}: UseTournamentsArgs = {}) {
  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (mine) params.set('mine', 'true');
      if (sport) params.set('sport', sport);
      const qs = params.toString();
      const path = qs ? `/tournaments?${qs}` : '/tournaments';
      const data = await api.get<TournamentListResponse>(path);
      setItems(data.items);
      setAvailable(true);
      _availabilityCache = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        setAvailable(false);
        setItems([]);
        _availabilityCache = false;
      } else {
        setError(msg || 'Could not load tournaments.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [mine, sport, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, isLoading, error, available, refresh };
}

interface UseTournamentDetailArgs {
  tournamentId: string | null;
  enabled?: boolean;
}

export function useTournamentDetail({
  tournamentId,
  enabled = true,
}: UseTournamentDetailArgs) {
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !tournamentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<TournamentDetail>(`/tournaments/${tournamentId}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tournament.');
    } finally {
      setIsLoading(false);
    }
  }, [tournamentId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const join = useCallback(async () => {
    if (!tournamentId) return;
    const data = await api.post<TournamentDetail>(`/tournaments/${tournamentId}/join`);
    setDetail(data);
  }, [tournamentId]);

  const leave = useCallback(async () => {
    if (!tournamentId) return;
    const data = await api.post<TournamentDetail>(`/tournaments/${tournamentId}/leave`);
    setDetail(data);
  }, [tournamentId]);

  return { detail, isLoading, error, join, leave, refresh };
}
