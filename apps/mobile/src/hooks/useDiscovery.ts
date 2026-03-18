import { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';

export interface PartnerCard {
  userId: string;
  displayName: string;
  suburb?: string;
  bioExcerpt?: string;
  avatarUrl?: string;
  age?: number;
  sportProfiles: Array<{
    sport: string;
    level: string;
    gymName?: string;
    golfClub?: string;
  }>;
}

interface ActionResponse {
  matchCreated: boolean;
  matchId?: string;
}

export interface UseDiscoveryReturn {
  partners: PartnerCard[];
  isLoading: boolean;
  error: string | null;
  sport: 'gym' | 'golf';
  setSport: (s: 'gym' | 'golf') => void;
  recordAction: (
    targetUserId: string,
    action: 'like' | 'pass' | 'save'
  ) => Promise<ActionResponse>;
  fetchMore: () => void;
}

const PAGE_LIMIT = 20;

export function useDiscovery(): UseDiscoveryReturn {
  const [partners, setPartners] = useState<PartnerCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sport, setSportState] = useState<'gym' | 'golf'>('gym');

  async function fetchPartners(selectedSport: 'gym' | 'golf') {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<{ items: PartnerCard[] }>(
        `/discovery?sport=${selectedSport}&limit=${PAGE_LIMIT}`
      );
      setPartners(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partners.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchPartners(sport);
  }, [sport]);

  function setSport(s: 'gym' | 'golf') {
    setSportState(s);
  }

  const recordAction = useCallback(
    async (
      targetUserId: string,
      action: 'like' | 'pass' | 'save'
    ): Promise<ActionResponse> => {
      const result = await api.post<ActionResponse>('/discovery/actions', {
        targetUserId,
        action,
        sport,
      });
      // Remove acted-upon partner from the local list
      setPartners((prev) => prev.filter((p) => p.userId !== targetUserId));
      return result;
    },
    [sport]
  );

  function fetchMore() {
    fetchPartners(sport);
  }

  return {
    partners,
    isLoading,
    error,
    sport,
    setSport,
    recordAction,
    fetchMore,
  };
}
