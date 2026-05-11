import { useCallback, useEffect, useState } from 'react';

import {
  type EventDetail,
  type EventListResponse,
  type EventMode,
  type EventSummary,
  getEvent,
  joinEvent,
  leaveEvent,
  listEvents,
} from '../lib/events';

interface UseEventsArgs {
  mine?: boolean;
  sport?: string;
  mode?: EventMode;
  enabled?: boolean;
}

export function useEvents({
  mine = false,
  sport,
  mode,
  enabled = true,
}: UseEventsArgs = {}) {
  const [items, setItems] = useState<EventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const data: EventListResponse = await listEvents({ mine, sport, mode });
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load battles.');
    } finally {
      setIsLoading(false);
    }
  }, [mine, sport, mode, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, isLoading, error, refresh };
}

interface UseEventDetailArgs {
  eventId: string | null;
  enabled?: boolean;
}

export function useEventDetail({ eventId, enabled = true }: UseEventDetailArgs) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !eventId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getEvent(eventId);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load battle.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const join = useCallback(async () => {
    if (!eventId) return;
    const data = await joinEvent(eventId);
    setDetail(data);
  }, [eventId]);

  const leave = useCallback(async () => {
    if (!eventId) return;
    const data = await leaveEvent(eventId);
    setDetail(data);
  }, [eventId]);

  return { detail, isLoading, error, join, leave, refresh };
}
