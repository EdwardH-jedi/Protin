/**
 * Honor / Gang Score (V1.1) API client.
 *
 * Thin wrapper around the /rank/me and /rank/users/{id} endpoints.
 * Shape lives in @protin/shared-types — keep this file intentionally
 * narrow so the type contract stays in one place.
 */

import { api } from './api';
import type { HonorSummary } from '@protin/shared-types';

export type {
  HonorLevel,
  HonorSummary,
  SportLevelSummary,
} from '@protin/shared-types';

export async function getMyHonorSummary(): Promise<HonorSummary> {
  return api.get<HonorSummary>('/rank/me');
}

export async function getUserHonorSummary(userId: string): Promise<HonorSummary> {
  return api.get<HonorSummary>(`/rank/users/${userId}`);
}

// ---------------------------------------------------------------------------
// Session cache for /rank/users/{id} lookups
//
// Surfaces like Battle list cards render N event rows where many share
// the same host. A naive per-card fetch fan-outs into N requests; this
// cache collapses duplicate host_user_id lookups to a single request
// per session and deduplicates concurrent in-flight calls.
//
// Cache is intentionally simple and process-local — no TTL, no LRU.
// Refresh on cold start is sufficient for the current usage; promote
// to a real cache if Battle list latency demands it.
// ---------------------------------------------------------------------------

const _summaryCache = new Map<string, HonorSummary>();
const _inflight = new Map<string, Promise<HonorSummary>>();

/**
 * Returns a cached HonorSummary for the given user id, fetching once
 * per session. Concurrent callers share the same in-flight promise.
 * Errors are NOT cached so a transient failure can be retried by a
 * later caller.
 */
export async function getUserHonorSummaryCached(
  userId: string
): Promise<HonorSummary> {
  const cached = _summaryCache.get(userId);
  if (cached) return cached;

  const pending = _inflight.get(userId);
  if (pending) return pending;

  const promise = getUserHonorSummary(userId)
    .then((data) => {
      _summaryCache.set(userId, data);
      return data;
    })
    .finally(() => {
      _inflight.delete(userId);
    });
  _inflight.set(userId, promise);
  return promise;
}

/** Test-only helper to drop cached summaries between tests. */
export function _resetUserHonorSummaryCache(): void {
  _summaryCache.clear();
  _inflight.clear();
}
