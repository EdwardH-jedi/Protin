import { useCallback, useEffect, useState } from 'react';

import {
  acceptChallenge as acceptChallengeApi,
  cancelChallenge as cancelChallengeApi,
  declineChallenge as declineChallengeApi,
  getChallenge,
  listChallenges,
  submitChallengeResult,
  type ChallengeRead,
  type ChallengeStatus,
  type SubmitChallengeResultRequest,
} from '../lib/challenges';

interface UseChallengesArgs {
  status?: ChallengeStatus;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

interface UseChallengesResult {
  items: ChallengeRead[];
  total: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches the caller's challenge list. ``status`` is optional — when
 * omitted the backend returns every challenge where the caller is
 * either challenger or opponent. The list screen relies on the
 * unfiltered shape so it can group client-side into incoming / active
 * / done sections without doing three separate requests.
 */
export function useChallenges({
  status,
  limit,
  offset,
  enabled = true,
}: UseChallengesArgs = {}): UseChallengesResult {
  const [items, setItems] = useState<ChallengeRead[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await listChallenges({ status, limit, offset });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load challenges.');
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [status, limit, offset, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, total, isLoading, error, refresh };
}

interface UseChallengeDetailArgs {
  challengeId: string | null;
  enabled?: boolean;
}

interface UseChallengeDetailResult {
  detail: ChallengeRead | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  cancel: () => Promise<void>;
  submitResult: (body: SubmitChallengeResultRequest) => Promise<void>;
}

/**
 * Fetches a single challenge by id and exposes the lifecycle mutation
 * helpers. Each mutation updates ``detail`` in place so the consumer
 * does not have to re-render against a separate refresh round-trip.
 */
export function useChallengeDetail({
  challengeId,
  enabled = true,
}: UseChallengeDetailArgs): UseChallengeDetailResult {
  const [detail, setDetail] = useState<ChallengeRead | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !challengeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getChallenge(challengeId);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load challenge.');
    } finally {
      setIsLoading(false);
    }
  }, [challengeId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accept = useCallback(async () => {
    if (!challengeId) return;
    const data = await acceptChallengeApi(challengeId);
    setDetail(data);
  }, [challengeId]);

  const decline = useCallback(async () => {
    if (!challengeId) return;
    const data = await declineChallengeApi(challengeId);
    setDetail(data);
  }, [challengeId]);

  const cancel = useCallback(async () => {
    if (!challengeId) return;
    const data = await cancelChallengeApi(challengeId);
    setDetail(data);
  }, [challengeId]);

  const submitResult = useCallback(
    async (body: SubmitChallengeResultRequest) => {
      if (!challengeId) return;
      const data = await submitChallengeResult(challengeId, body);
      setDetail(data);
    },
    [challengeId]
  );

  return {
    detail,
    isLoading,
    error,
    refresh,
    accept,
    decline,
    cancel,
    submitResult,
  };
}
