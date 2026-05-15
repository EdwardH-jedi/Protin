import { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';
import type { NearbyVenuesResponse, Sport, Venue } from '@protin/shared-types';

interface UseNearbyVenuesArgs {
  sport: Sport;
  /** Pass both lat and lng or neither. */
  lat?: number;
  lng?: number;
  /**
   * Optional search radius in km. Only sent to the server when defined
   * AND coordinates are provided — the backend silently ignores it on the
   * no-coordinate catalog path. Omit to use the backend default (10km).
   */
  radiusKm?: number;
  /** When false, the hook will not fetch (use to skip until the modal opens). */
  enabled?: boolean;
}

interface UseNearbyVenuesResult {
  venues: Venue[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches /venues/nearby for the given sport.
 *
 * The mobile app does not currently request location permission (no
 * expo-location dependency yet), so callers normally omit lat/lng and the
 * server returns the catalog sorted alphabetically. Once a location source
 * is added, pass coordinates and the server will sort by distance.
 */
export function useNearbyVenues({
  sport,
  lat,
  lng,
  radiusKm,
  enabled = true,
}: UseNearbyVenuesArgs): UseNearbyVenuesResult {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVenues = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sport });
      if (lat !== undefined && lng !== undefined) {
        params.set('lat', String(lat));
        params.set('lng', String(lng));
        // radius_km is only meaningful with coords — backend ignores it
        // on the catalog path. Skip the param when callers omit it so
        // the request stays byte-identical to the prior nearby URL and
        // existing test assertions keep passing.
        if (radiusKm !== undefined && Number.isFinite(radiusKm)) {
          params.set('radius_km', String(radiusKm));
        }
      }
      const data = await api.get<NearbyVenuesResponse>(`/venues/nearby?${params.toString()}`);
      setVenues(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load nearby courts.');
      setVenues([]);
    } finally {
      setIsLoading(false);
    }
  }, [sport, lat, lng, radiusKm, enabled]);

  useEffect(() => {
    void fetchVenues();
  }, [fetchVenues]);

  return { venues, isLoading, error, refresh: fetchVenues };
}
