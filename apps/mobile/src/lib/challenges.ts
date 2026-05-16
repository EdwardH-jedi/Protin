/**
 * Sports Challenge API client.
 *
 * Thin wrapper around the typed ``/challenges`` surface. All payload
 * shapes live in ``@protin/shared-types``; the api helper auto-transforms
 * camelCase request bodies to snake_case on the wire and snake_case
 * responses back to camelCase. Mobile must never call any honor/rank
 * endpoint directly — result submission lives behind
 * ``POST /challenges/{id}/result`` and the backend gates the side effects.
 */

import { api } from './api';
import type {
  ChallengeListResponse,
  ChallengeRead,
  ChallengeStatus,
  CreateChallengeRequest,
  SubmitChallengeResultRequest,
} from '@protin/shared-types';

export type {
  ChallengeListResponse,
  ChallengeRead,
  ChallengeStatus,
  CreateChallengeRequest,
  SubmitChallengeResultRequest,
} from '@protin/shared-types';

export interface ListChallengesParams {
  status?: ChallengeStatus;
  limit?: number;
  offset?: number;
}

function buildQuery(params: ListChallengesParams): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export async function listChallenges(
  params: ListChallengesParams = {}
): Promise<ChallengeListResponse> {
  return api.get<ChallengeListResponse>(`/challenges${buildQuery(params)}`);
}

export async function getChallenge(challengeId: string): Promise<ChallengeRead> {
  return api.get<ChallengeRead>(`/challenges/${challengeId}`);
}

export async function createChallenge(
  body: CreateChallengeRequest
): Promise<ChallengeRead> {
  return api.post<ChallengeRead>('/challenges', body);
}

export async function acceptChallenge(challengeId: string): Promise<ChallengeRead> {
  return api.post<ChallengeRead>(`/challenges/${challengeId}/accept`);
}

export async function declineChallenge(challengeId: string): Promise<ChallengeRead> {
  return api.post<ChallengeRead>(`/challenges/${challengeId}/decline`);
}

export async function cancelChallenge(challengeId: string): Promise<ChallengeRead> {
  return api.post<ChallengeRead>(`/challenges/${challengeId}/cancel`);
}

export async function submitChallengeResult(
  challengeId: string,
  body: SubmitChallengeResultRequest
): Promise<ChallengeRead> {
  return api.post<ChallengeRead>(`/challenges/${challengeId}/result`, body);
}

/**
 * Statuses that cannot transition further. Useful for the detail
 * screen to decide whether to render action buttons at all.
 */
export const CHALLENGE_TERMINAL_STATUSES: readonly ChallengeStatus[] = [
  'declined',
  'cancelled',
  'verified',
  'disputed',
];

export function isChallengeTerminal(status: ChallengeStatus): boolean {
  return CHALLENGE_TERMINAL_STATUSES.includes(status);
}
