/**
 * Events ("battles" in the UI) API client.
 *
 * Wraps the typed /events surface. The shared @protin/shared-types
 * package owns the response shapes — this file is intentionally thin
 * so the type contract stays in one place.
 */

import { api } from './api';
import type {
  CreateEventRequest,
  EventDetail,
  EventListResponse,
  EventMode,
  EventSummary,
} from '@protin/shared-types';

export type {
  CreateEventRequest,
  EventDetail,
  EventListResponse,
  EventMode,
  EventStatus,
  EventSummary,
  EventVisibility,
} from '@protin/shared-types';

export interface ListEventsParams {
  mine?: boolean;
  sport?: string;
  mode?: EventMode;
  limit?: number;
  offset?: number;
}

function buildQuery(params: ListEventsParams): string {
  const qs = new URLSearchParams();
  if (params.mine) qs.set('mine', 'true');
  if (params.sport) qs.set('sport', params.sport);
  if (params.mode) qs.set('mode', params.mode);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export async function listEvents(
  params: ListEventsParams = {}
): Promise<EventListResponse> {
  return api.get<EventListResponse>(`/events${buildQuery(params)}`);
}

export async function getEvent(eventId: string): Promise<EventDetail> {
  return api.get<EventDetail>(`/events/${eventId}`);
}

export async function createEvent(body: CreateEventRequest): Promise<EventDetail> {
  return api.post<EventDetail>('/events', body);
}

export async function joinEvent(eventId: string): Promise<EventDetail> {
  return api.post<EventDetail>(`/events/${eventId}/join`);
}

export async function leaveEvent(eventId: string): Promise<EventDetail> {
  return api.post<EventDetail>(`/events/${eventId}/leave`);
}

// ---------------------------------------------------------------------------
// Sport vocabulary
// ---------------------------------------------------------------------------

/**
 * Battle sport options. Keep in sync with the brief. Backend stores
 * sport as freeform lowercase string, so adding more here doesn't
 * require a migration.
 */
export const BATTLE_SPORTS = [
  { value: 'basketball', label: 'Basketball' },
  { value: 'soccer', label: 'Soccer' },
  { value: 'running', label: 'Run' },
  { value: 'golf', label: 'Golf' },
  { value: 'badminton', label: 'Badminton' },
  { value: 'tennis', label: 'Tennis' },
] as const;

export type BattleSportValue = (typeof BATTLE_SPORTS)[number]['value'];

/** Default capacities by sport — used as initial value in the host form. */
export const SPORT_CAPACITY_DEFAULTS: Record<string, number> = {
  basketball: 10,
  soccer: 10,
  running: 30,
  golf: 4,
  badminton: 4,
  tennis: 2,
};

export function sportLabelForBattle(sport: string): string {
  const found = BATTLE_SPORTS.find((s) => s.value === sport);
  return found ? found.label : sport.charAt(0).toUpperCase() + sport.slice(1);
}

/** Compact "Sat 17 May · 09:00" style. */
export function formatEventWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
}
