import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AppleSignInRequest, MeResponse, TokenResponse } from '@protin/shared-types';

import { api, setToken } from '../lib/api';
import { useProfileStore } from './profile';

const TOKEN_KEY = 'protin.auth.token';

interface AuthState {
  token: string | null;
  user: MeResponse | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithApple: (payload: AppleSignInRequest) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

/**
 * After `/auth/login`, `/auth/register`, or `/auth/apple` returns a token,
 * persist the token and immediately fetch `/auth/me` so the in-memory `user`
 * is populated for the rest of the session. Without this hydration step, the
 * store's `user.id` only landed on cold-start (via `initialize()`), which
 * caused mid-session login / account-switch flows to enter screens with
 * `currentUserId = null` and rely on a brittle fallback that mis-rendered
 * chat ownership on the iPhone.
 *
 * If `/auth/me` fails after the token landed, mirror `initialize()`'s
 * conservative behavior: drop the just-stored token so the app stays in a
 * logged-out state rather than carrying a token without a user, and rethrow
 * a friendly error so the auth screen can surface it.
 */
async function hydrateUserAfterToken(
  set: (partial: Partial<AuthState>) => void,
  accessToken: string
): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  setToken(accessToken);
  set({ token: accessToken, user: null });
  try {
    const me = await api.get<MeResponse>('/auth/me');
    set({ user: me });
  } catch (err) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    set({ token: null, user: null });
    throw err instanceof Error
      ? err
      : new Error('Signed in, but could not load your account. Please try again.');
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await api.post<TokenResponse>('/auth/login', { email, password });
      await hydrateUserAfterToken(set, data.accessToken);
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await api.post<TokenResponse>('/auth/register', { email, password });
      await hydrateUserAfterToken(set, data.accessToken);
    } finally {
      set({ isLoading: false });
    }
  },

  loginWithApple: async (payload) => {
    set({ isLoading: true });
    try {
      const data = await api.post<TokenResponse>('/auth/apple', {
        identityToken: payload.identityToken,
        nonce: payload.nonce,
        email: payload.email ?? undefined,
        name: payload.name ?? undefined,
      });
      await hydrateUserAfterToken(set, data.accessToken);
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    set({ token: null, user: null });
    // Drop every session-bound row out of the profile store too.
    // Without this, a logged-out (or just-deleted) user could briefly see
    // the previous account's display name, photos and sport rows on the
    // Profile tab while navigation is being reset.
    useProfileStore.getState().reset();
  },

  initialize: async () => {
    try {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!stored) return;
      setToken(stored);
      const user = await api.get<MeResponse>('/auth/me');
      set({ token: stored, user });
    } catch {
      // Token may be invalid — clear it silently
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setToken(null);
    }
  },
}));
