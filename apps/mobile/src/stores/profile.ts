import { create } from 'zustand';
import type {
  IdentityPreferences,
  SetIdentityPreferencesRequest,
  Sport,
  SportProfile,
  UpsertSportProfileRequest,
  UserProfile,
} from '@protin/shared-types';

import { api } from '../lib/api';

export type SportType = Sport;

export const SPORT_LABELS: Record<SportType, string> = {
  gym: 'Gym',
  golf: 'Golf',
  tennis: 'Tennis',
  running: 'Running',
};

export function sportLabel(sport: string): string {
  return SPORT_LABELS[sport as SportType] ?? sport.charAt(0).toUpperCase() + sport.slice(1);
}

interface ProfileState {
  profile: UserProfile | null;
  identityPreferences: IdentityPreferences | null;
  sportProfiles: SportProfile[] | null;
  // Local-only: the backend currently persists a single avatar_url and has no
  // multi-photo column. Slice B keeps selected photo URIs in memory so the
  // onboarding UI can enforce min/max and continue the flow. Real upload /
  // persistence is deferred to a later slice.
  photoUris: string[];
  fetchProfile: () => Promise<void>;
  upsertProfile: (data: Partial<UserProfile>) => Promise<void>;
  setPhotoUris: (uris: string[]) => void;
  upsertIdentityPreferences: (data: SetIdentityPreferencesRequest) => Promise<void>;
  upsertSportProfile: (data: UpsertSportProfileRequest) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  identityPreferences: null,
  sportProfiles: null,
  photoUris: [],

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

  setPhotoUris: (uris) => {
    set({ photoUris: uris });
  },

  upsertIdentityPreferences: async (data) => {
    const updated = await api.put<IdentityPreferences>('/users/me/identity-preferences', data);
    set({ identityPreferences: updated });
  },

  upsertSportProfile: async (data) => {
    const updated = await api.post<SportProfile>('/users/me/sport-profiles', data);
    const current = get().sportProfiles ?? [];
    const idx = current.findIndex((sp) => sp.sport === data.sport);
    const next = idx >= 0 ? current.map((sp, i) => (i === idx ? updated : sp)) : [...current, updated];
    set({ sportProfiles: next });
  },
}));
