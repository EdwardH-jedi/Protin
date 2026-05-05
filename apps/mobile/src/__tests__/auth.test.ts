/**
 * useAuthStore tests — focused on the post-token hydration step.
 *
 * Why this file exists: the iPhone Chris/Sarah ownership regression was
 * caused by the store leaving `user: null` after `login` / `register` /
 * `loginWithApple` until the next cold-start. These tests pin the
 * contract that every auth-success path hydrates the auth user via
 * `/auth/me` immediately, and that a `/auth/me` failure leaves the
 * store in a clean logged-out state instead of carrying a token without
 * a user.
 */

import * as SecureStore from 'expo-secure-store';

import { useAuthStore } from '../stores/auth';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockSetToken = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
  setToken: (...args: unknown[]) => mockSetToken(...args),
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

// The auth store imports useProfileStore for `logout` cleanup. The hydration
// path doesn't touch it, but the import chain still resolves the module — stub
// just enough surface to keep the test environment quiet.
jest.mock('../stores/profile', () => ({
  useProfileStore: { getState: () => ({ reset: jest.fn() }) },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetAuthStore() {
  useAuthStore.setState({ token: null, user: null, isLoading: false });
}

const FAKE_TOKEN = 'jwt-after-login';
const FAKE_ME = {
  id: 'user-from-me-endpoint',
  email: 'chris@example.com',
  isActive: true,
  createdAt: '2026-04-08T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  resetAuthStore();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useAuthStore — login hydrates user via /auth/me', () => {
  it('persists token then fetches /auth/me and stores the user', async () => {
    mockApiPost.mockResolvedValue({ accessToken: FAKE_TOKEN, tokenType: 'bearer' });
    mockApiGet.mockResolvedValue(FAKE_ME);

    await useAuthStore.getState().login('chris@example.com', 'password123');

    // Token was persisted to SecureStore and to the api module.
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('protin.auth.token', FAKE_TOKEN);
    expect(mockSetToken).toHaveBeenCalledWith(FAKE_TOKEN);

    // /auth/me was fetched after the token landed.
    expect(mockApiGet).toHaveBeenCalledWith('/auth/me');

    // User is populated in the store.
    const state = useAuthStore.getState();
    expect(state.token).toBe(FAKE_TOKEN);
    expect(state.user?.id).toBe('user-from-me-endpoint');
  });

  it('clears the just-stored token if /auth/me fails so the app stays logged-out', async () => {
    mockApiPost.mockResolvedValue({ accessToken: FAKE_TOKEN, tokenType: 'bearer' });
    mockApiGet.mockRejectedValue(new Error('Network down'));

    await expect(
      useAuthStore.getState().login('chris@example.com', 'password123')
    ).rejects.toThrow('Network down');

    // SecureStore was wiped, the api module's token was reset, and the
    // store ends up with no token + no user (clean logged-out state).
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('protin.auth.token');
    expect(mockSetToken).toHaveBeenLastCalledWith(null);
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });
});

describe('useAuthStore — register hydrates user via /auth/me', () => {
  it('hydrates the user after a successful register', async () => {
    mockApiPost.mockResolvedValue({ accessToken: FAKE_TOKEN, tokenType: 'bearer' });
    mockApiGet.mockResolvedValue(FAKE_ME);

    await useAuthStore.getState().register('newuser@example.com', 'password123');

    expect(mockApiGet).toHaveBeenCalledWith('/auth/me');
    expect(useAuthStore.getState().user?.id).toBe('user-from-me-endpoint');
  });

  it('rejects and clears the token if /auth/me fails after register', async () => {
    mockApiPost.mockResolvedValue({ accessToken: FAKE_TOKEN, tokenType: 'bearer' });
    mockApiGet.mockRejectedValue(new Error('Server unreachable'));

    await expect(
      useAuthStore.getState().register('newuser@example.com', 'password123')
    ).rejects.toThrow('Server unreachable');

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });
});

describe('useAuthStore — loginWithApple hydrates user via /auth/me', () => {
  it('hydrates the user after a successful Apple sign-in', async () => {
    mockApiPost.mockResolvedValue({ accessToken: FAKE_TOKEN, tokenType: 'bearer' });
    mockApiGet.mockResolvedValue(FAKE_ME);

    await useAuthStore.getState().loginWithApple({
      identityToken: 'apple-identity-token',
      nonce: 'nonce-1',
      email: 'sarah@example.com',
      name: 'Sarah',
    });

    expect(mockApiPost).toHaveBeenCalledWith('/auth/apple', expect.objectContaining({
      identityToken: 'apple-identity-token',
    }));
    expect(mockApiGet).toHaveBeenCalledWith('/auth/me');
    expect(useAuthStore.getState().user?.id).toBe('user-from-me-endpoint');
  });
});

describe('useAuthStore — switching accounts mid-session', () => {
  it('replaces user.id after a logout-then-login flow (no stale Chris while signed in as Sarah)', async () => {
    // Cold-start as Chris.
    mockApiPost.mockResolvedValueOnce({ accessToken: 'chris-token', tokenType: 'bearer' });
    mockApiGet.mockResolvedValueOnce({ ...FAKE_ME, id: 'chris-id', email: 'chris@example.com' });
    await useAuthStore.getState().login('chris@example.com', 'password123');
    expect(useAuthStore.getState().user?.id).toBe('chris-id');

    // Logout drops user.
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();

    // Sarah logs in mid-session — user must be hydrated to Sarah, not stay
    // null and not stay as Chris.
    mockApiPost.mockResolvedValueOnce({ accessToken: 'sarah-token', tokenType: 'bearer' });
    mockApiGet.mockResolvedValueOnce({ ...FAKE_ME, id: 'sarah-id', email: 'sarah@example.com' });
    await useAuthStore.getState().login('sarah@example.com', 'password123');
    expect(useAuthStore.getState().user?.id).toBe('sarah-id');
  });
});
