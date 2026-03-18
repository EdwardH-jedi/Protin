import { create } from 'zustand';

import { api } from '../lib/api';

// ─── Domain types ─────────────────────────────────────────────────────────────
// These will be imported from @protin/shared-types once that package is ready.

export interface UserProfile {
  id: string;
  userId: string;
  displayName: string;
  bio?: string;
  birthYear?: number;
  suburb?: string;
  avatarUrl?: string;
}

export interface IdentityPreferences {
  id?: string;
  openTo: string[];
  ageRangeMin: number;
  ageRangeMax: number;
  maxDistanceKm: number;
}

export interface SportProfile {
  id?: string;
  sport: 'gym' | 'golf';
  level: 'beginner' | 'intermediate' | 'advanced';
  preferredTimes: string[];
  gymName?: string;
  golfClub?: string;
  goals?: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ProfileState {
  profile: UserProfile | null;
  identityPreferences: IdentityPreferences | null;
  sportProfiles: SportProfile[] | null;
  fetchProfile: () => Promise<void>;
  upsertProfile: (data: Partial<UserProfile>) => Promise<void>;
  upsertIdentityPreferences: (data: IdentityPreferences) => Promise<void>;
  upsertSportProfile: (data: SportProfile) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  identityPreferences: null,
  sportProfiles: null,

  fetchProfile: async () => {
    const profile = await api.get<UserProfile>('/users/me/profile');
    const identityPreferences = await api.get<IdentityPreferences>('/users/me/identity-preferences');
    const sportProfiles = await api.get<SportProfile[]>('/users/me/sport-profiles');
    set({ profile, identityPreferences, sportProfiles });
  },

  upsertProfile: async (data) => {
    const updated = await api.put<UserProfile>('/users/me/profile', data);
    set({ profile: updated });
  },

  upsertIdentityPreferences: async (data) => {
    const updated = await api.put<IdentityPreferences>('/users/me/identity-preferences', data);
    set({ identityPreferences: updated });
  },

  upsertSportProfile: async (data) => {
    const updated = await api.post<SportProfile>('/users/me/sport-profiles', data);
    const current = get().sportProfiles ?? [];
    const idx = current.findIndex((sp) => sp.sport === data.sport);
    const next =
      idx >= 0
        ? current.map((sp, i) => (i === idx ? updated : sp))
        : [...current, updated];
    set({ sportProfiles: next });
  },
}));
