import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import type {
  NearbyVenuesResponse,
  Venue,
  VenueProviderStatus,
  VenueSourceMode,
} from '@protin/shared-types';

interface UseNearbyVenuesArgs {
  /**
   * Sport identifier sent verbatim to /venues/nearby. Backend declares
   * `sport: str` (apps/api/app/routers/venues.py) and returns an empty
   * result set for any value it doesn't recognize — so accepting a free
   * string (e.g. "basketball", "soccer", "badminton") instead of the
   * narrow shared `Sport` literal lets the picker render uniformly for
   * every Battle/Game sport without breaking the typed-events contract.
   */
  sport: string;
  /** Pass both lat and lng or neither. */
  lat?: number;
  lng?: number;
  /**
   * Optional search radius in km. Only sent to the server when defined
   * AND coordinates are provided — the backend silently ignores it on the
   * no-coordinate catalog path. Omit to use the backend default (10km).
   */
  radiusKm?: number;
  /**
   * Optional source mode for the Stream 2 /venues/nearby?source= param.
   * Omitting the field is equivalent to "seed" on the server side —
   * keeping the URL byte-identical to v1.0 for any caller that hasn't
   * been migrated yet.
   *
   *   - "seed"   → local catalog only (v1.0 behaviour)
   *   - "places" → Google Places only, backend-side (coords required)
   *   - "both"   → seed + Places merged + deduped server-side
   *
   * The Google API key is held on the backend; the hook never sees it.
   */
  source?: VenueSourceMode;
  /**
   * Free-text Google Places search override (e.g. "Bondi pickleball").
   * Trimmed and forwarded as ``?q=`` to the backend; the API routes it
   * through Google Places Text Search. Empty / whitespace-only values
   * are dropped so an empty input keeps the default sport-based phrase.
   */
  q?: string;
  /**
   * Max venues per page. When omitted the backend default (20) is used,
   * matching pre-v1.1 callers. The picker passes a higher value so the
   * map / list is comprehensively populated on first open; the backend
   * still caps at 50.
   */
  limit?: number;
  /** When false, the hook will not fetch (use to skip until the modal opens). */
  enabled?: boolean;
}

interface UseNearbyVenuesResult {
  venues: Venue[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  /**
   * Coarse provider status — used by the picker to render explicit
   * states like "Google Places unavailable", "Search quota reached",
   * or "Showing Sydney catalog only". Defaults to "disabled" when the
   * server omits the field (v1.0 backend / source="seed").
   */
  providerStatus: VenueProviderStatus;
  /** Opaque cursor for the next page, or null when no further pages exist. */
  nextCursor: string | null;
  /** True when {@link nextCursor} is non-null AND we're not currently fetching. */
  hasMore: boolean;
  refresh: () => Promise<void>;
  /**
   * Fetches the next page of Places results using {@link nextCursor}
   * and appends them to the existing list. No-op when there is no
   * next page or a fetch is already in flight.
   */
  loadMore: () => Promise<void>;
}

function buildParams(args: {
  sport: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  source?: VenueSourceMode;
  q?: string;
  limit?: number;
  cursor?: string;
}): URLSearchParams {
  const params = new URLSearchParams({ sport: args.sport });
  if (args.lat !== undefined && args.lng !== undefined) {
    params.set('lat', String(args.lat));
    params.set('lng', String(args.lng));
    if (args.radiusKm !== undefined && Number.isFinite(args.radiusKm)) {
      params.set('radius_km', String(args.radiusKm));
    }
  }
  if (args.source !== undefined) {
    params.set('source', args.source);
  }
  const trimmedQ = args.q?.trim();
  if (trimmedQ) {
    params.set('q', trimmedQ);
  }
  if (args.limit !== undefined && Number.isFinite(args.limit)) {
    params.set('limit', String(args.limit));
  }
  if (args.cursor) {
    params.set('cursor', args.cursor);
  }
  return params;
}

function appendDedupedVenues(prev: Venue[], next: Venue[]): Venue[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((venue) => venue.id));
  const merged = [...prev];
  for (const venue of next) {
    if (seen.has(venue.id)) continue;
    seen.add(venue.id);
    merged.push(venue);
  }
  return merged;
}

/**
 * Fetches /venues/nearby for the given sport.
 *
 * Re-fetches whenever the search arguments change. Exposes a
 * {@link UseNearbyVenuesResult.loadMore} callback for paginating
 * through Google Places Text Search results when the backend returns
 * a ``next_cursor``.
 */
export function useNearbyVenues({
  sport,
  lat,
  lng,
  radiusKm,
  source,
  q,
  limit,
  enabled = true,
}: UseNearbyVenuesArgs): UseNearbyVenuesResult {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] =
    useState<VenueProviderStatus>('disabled');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Guard against state writes for a stale request after the search
  // args have changed (e.g. user typed faster than the network).
  const fetchIdRef = useRef(0);

  const fetchPage = useCallback(
    async (cursor: string | undefined) => {
      if (!enabled) return;
      const isFirstPage = !cursor;
      const fetchId = ++fetchIdRef.current;
      if (isFirstPage) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);
      try {
        const params = buildParams({ sport, lat, lng, radiusKm, source, q, limit, cursor });
        const data = await api.get<NearbyVenuesResponse>(
          `/venues/nearby?${params.toString()}`,
        );
        if (fetchId !== fetchIdRef.current) return; // stale
        setVenues((prev) =>
          isFirstPage ? data.items : appendDedupedVenues(prev, data.items),
        );
        setProviderStatus(data.providerStatus ?? 'disabled');
        setNextCursor(data.nextCursor ?? null);
      } catch (err) {
        if (fetchId !== fetchIdRef.current) return; // stale
        setError(err instanceof Error ? err.message : 'Could not load nearby courts.');
        if (isFirstPage) {
          setVenues([]);
          setProviderStatus('error');
          setNextCursor(null);
        }
      } finally {
        if (fetchId === fetchIdRef.current) {
          if (isFirstPage) {
            setIsLoading(false);
          } else {
            setIsLoadingMore(false);
          }
        }
      }
    },
    [sport, lat, lng, radiusKm, source, q, limit, enabled],
  );

  const refresh = useCallback(() => fetchPage(undefined), [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading || isLoadingMore) return;
    await fetchPage(nextCursor);
  }, [nextCursor, isLoading, isLoadingMore, fetchPage]);

  // Re-fetch the first page whenever the search args change. The hook
  // captures `q` so callers that wire it to a debounced input get
  // automatic refetch semantics.
  useEffect(() => {
    if (!enabled) return;
    void fetchPage(undefined);
  }, [fetchPage, enabled]);

  return {
    venues,
    isLoading,
    isLoadingMore,
    error,
    providerStatus,
    nextCursor,
    hasMore: nextCursor !== null && !isLoading && !isLoadingMore,
    refresh,
    loadMore,
  };
}
