/**
 * Sports Reputation domain types: rank + tier + honor.
 *
 * Tier is a *computed* band over `rankPoints` — never stored, never
 * sent independently of its derivation. The same shape is used for the
 * self endpoint and the public endpoint; the schema is deliberately the
 * sanitized superset.
 */

import type { ISODateString, UUID } from './common';
import type { Sport } from './sport-profile';

export type RankTier = 'Rookie' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';

export interface SportRankSummary {
  sport: Sport;
  rankPoints: number;
  tier: RankTier;
  sessionsCompleted: number;
}

export interface RankSummary {
  /** Bounded honor score (0..200). 100 is the new-player baseline. */
  honor: number;
  /** Per-sport positives only; sports without activity are absent. */
  sports: SportRankSummary[];
}

/**
 * V1.1 Honor / Gang Score / Sport Level summary.
 *
 * Distinct from {@link RankSummary} (legacy booking-driven) — this is
 * the event-driven view that the Profile/Me Honor card consumes.
 */
export type HonorLevel =
  | 'Rookie'
  | 'Regular'
  | 'Trusted'
  | 'Captain'
  | 'Legend';

export interface SportLevelSummary {
  sport: string;
  xp: number;
  level: number;
  attendedCount: number;
  hostedCount: number;
}

export interface HonorSummary {
  userId: UUID;
  honorScore: number;
  honorLevel: HonorLevel;
  gangScore: number;
  completedGamesCount: number;
  hostedGamesCount: number;
  noShowCount: number;
  excusedCount: number;
  pendingCount: number;
  sportLevels: SportLevelSummary[];
  generatedAt: ISODateString;
}
