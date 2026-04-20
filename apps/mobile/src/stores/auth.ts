import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AppleSignInRequest, MeResponse, TokenResponse } from '@protin/shared-types';

import { api, setToken } from '../lib/api';

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

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await api.post<TokenResponse>('/auth/login', { email, password });
      await SecureStore.setItemAsync(TOKEN_KEY, data.accessToken);
      setToken(data.accessToken);
      set({ token: data.accessToken, user: null });
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await api.post<TokenResponse>('/auth/register', { email, password });
      await SecureStore.setItemAsync(TOKEN_KEY, data.accessToken);
      setToken(data.accessToken);
      set({ token: data.accessToken, user: null });
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
      await SecureStore.setItemAsync(TOKEN_KEY, data.accessToken);
      setToken(data.accessToken);
      set({ token: data.accessToken, user: null });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    set({ token: null, user: null });
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
