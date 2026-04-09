/**
 * Discovery domain types.
 *
 * Discovery is the browsing surface — the Discover tab in the mobile app.
 *
 * A PartnerCard is the summary shown in the discovery feed.
 * A DiscoveryAction is a pass/like/save gesture by the current user.
 * When two users mutually like each other, a Match is created.
 */

import type { Paginated, UUID } from './common';
import type { FitnessLevel, PreferredTime, Sport } from './sport-profile';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type DiscoveryAction = 'like' | 'pass' | 'save';

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

export interface DiscoveryFilter {
  sport?: Sport;                 // required filter — gym, golf, tennis, or running
  level?: FitnessLevel;
  suburb?: string;               // Sydney suburb
  preferredTime?: PreferredTime;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/**
 * A potential workout partner as shown in the discovery feed.
 * Intentionally limited — enough to render a card and make a like/pass decision.
 */
export interface PartnerCard {
  userId: UUID;
  displayName: string;
  suburb?: string;
  bioExcerpt?: string;    // truncated at 160 chars by the API
  avatarUrl?: string;
  age?: number;           // derived from birthYear on the server
  sportProfiles: Array<{
    sport: Sport;
    level: FitnessLevel;
    gymName?: string;
    golfClub?: string;
  }>;
}

export type DiscoveryFeedResponse = Paginated<PartnerCard>;

// ---------------------------------------------------------------------------
// Request / response for recording an action
// ---------------------------------------------------------------------------

export interface RecordActionRequest {
  targetUserId: UUID;
  action: DiscoveryAction;
  sport: Sport;
}

export interface RecordActionResponse {
  action: DiscoveryAction;
  matchCreated: boolean;
  matchId?: UUID;
}
