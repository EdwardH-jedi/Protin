import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

import { api, setToken } from '../lib/api';

const TOKEN_KEY = 'protin.auth.token';

interface User {
  id: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

interface AuthResponse {
  accessToken: string;
  tokenType: string;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await api.post<AuthResponse>('/auth/login', { email, password });
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
      const data = await api.post<AuthResponse>('/auth/register', { email, password });
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
      const user = await api.get<User>('/auth/me');
      set({ token: stored, user });
    } catch {
      // Token may be invalid — clear it silently
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setToken(null);
    }
  },
}));
