/**
 * Sports Reputation domain types: rank + tier + honor.
 *
 * Tier is a *computed* band over `rankPoints` — never stored, never
 * sent independently of its derivation. The same shape is used for the
 * self endpoint and the public endpoint; the schema is deliberately the
 * sanitized superset.
 */

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
