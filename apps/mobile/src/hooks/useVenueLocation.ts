import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export type VenueLocationStatus =
  | 'idle'
  | 'loading'
  | 'granted'
  | 'denied'
  | 'unavailable';

export interface UseVenueLocationArgs {
  /**
   * Drives whether the hook will prompt and read a fix. Wire this to the
   * venue picker's open state so the OS prompt never appears on screens
   * the user hasn't entered yet.
   */
  enabled: boolean;
}

export interface UseVenueLocationResult {
  status: VenueLocationStatus;
  latitude?: number;
  longitude?: number;
  error?: string;
}

/**
 * Foreground-only location for the venue picker.
 *
 * Permission flow:
 *  - read current status first (no prompt)
 *  - prompt only when status is "undetermined" AND the OS still allows
 *    asking — so a hard-denied user is never re-prompted
 *  - on grant, fetch a single position fix at Balanced accuracy
 *
 * The hook never throws into the parent; any failure resolves to a
 * status the modal can render fallback copy for.
 */
export function useVenueLocation({ enabled }: UseVenueLocationArgs): UseVenueLocationResult {
  const [status, setStatus] = useState<VenueLocationStatus>('idle');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // Tracks an in-flight resolve so that a parent unmount or a rapid
  // re-disable doesn't push state into an unmounted component.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Once we've started resolving (or finished), don't kick off again —
  // including across enable=false → enable=true cycles when the picker
  // re-opens. This is what guarantees the user is never re-prompted.
  const startedRef = useRef(false);

  const resolve = useCallback(async () => {
    setStatus('loading');
    setError(undefined);
    try {
      const current = await Location.getForegroundPermissionsAsync();
      let granted = current.granted;
      if (!granted && current.status === Location.PermissionStatus.UNDETERMINED && current.canAskAgain) {
        const next = await Location.requestForegroundPermissionsAsync();
        granted = next.granted;
        if (!granted) {
          if (!aliveRef.current) return;
          setStatus('denied');
          return;
        }
      } else if (!granted) {
        if (!aliveRef.current) return;
        setStatus('denied');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!aliveRef.current) return;

      const { latitude: lat, longitude: lng } = position.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setStatus('unavailable');
        return;
      }
      setLatitude(lat);
      setLongitude(lng);
      setStatus('granted');
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : 'Could not read your location.');
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void resolve();
  }, [enabled, resolve]);

  return { status, latitude, longitude, error };
}
