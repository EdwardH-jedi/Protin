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
