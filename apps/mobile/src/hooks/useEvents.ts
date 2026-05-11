import { useCallback, useEffect, useState } from 'react';

import {
  type AttendanceListResponse,
  type AttendanceStatus,
  type EventDetail,
  type EventListResponse,
  type EventMode,
  type EventSummary,
  type HostAttendanceUpdateRequest,
  type SelfAttendanceStatus,
  getEvent,
  getEventAttendance,
  hostUpdateAttendance,
  joinEvent,
  leaveEvent,
  listEvents,
  selfReportAttendance,
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

interface UseEventAttendanceArgs {
  eventId: string | null;
  enabled?: boolean;
}

export function useEventAttendance({
  eventId,
  enabled = true,
}: UseEventAttendanceArgs) {
  const [data, setData] = useState<AttendanceListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !eventId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getEventAttendance(eventId);
      setData(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load attendance.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [eventId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateAsHost = useCallback(
    async (body: HostAttendanceUpdateRequest) => {
      if (!eventId) return;
      const entry = await hostUpdateAttendance(eventId, body);
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.participantUserId === entry.participantUserId ? entry : it
              ),
            }
          : prev
      );
      return entry;
    },
    [eventId]
  );

  const selfReport = useCallback(
    async (attendanceStatus: SelfAttendanceStatus) => {
      if (!eventId) return;
      const entry = await selfReportAttendance(eventId, { attendanceStatus });
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.participantUserId === entry.participantUserId ? entry : it
              ),
            }
          : prev
      );
      return entry;
    },
    [eventId]
  );

  return { data, isLoading, error, refresh, updateAsHost, selfReport };
}

export type { AttendanceStatus, SelfAttendanceStatus };
