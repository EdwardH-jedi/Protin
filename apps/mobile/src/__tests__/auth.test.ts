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
      authorizationCode: 'auth-code-1',
    });

    expect(mockApiPost).toHaveBeenCalledWith('/auth/apple', expect.objectContaining({
      identityToken: 'apple-identity-token',
      // Forwarded so the backend can exchange it for a revocable refresh token
      // (account deletion / App Store 5.1.1(v)).
      authorizationCode: 'auth-code-1',
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

// ─── Stale-op guard regression tests ─────────────────────────────────────────
//
// These tests pin the version-guard contract introduced after the iPhone
// Chris/Sarah real-device test, where both messages were saved with
// sender_id = Sarah even though the tester believed the second was sent as
// Chris. The bearer header at POST time matches whatever `setToken` last
// wrote into the api module, so a stale /auth/me that lands AFTER a later
// logout/login must be silently dropped — otherwise the api token gets
// re-pinned to the previous account and every subsequent request is mis-
// authenticated as that user.

describe('useAuthStore — stale auth-op results cannot overwrite a later identity', () => {
  it('drops a hydrate /auth/me result that resolves AFTER a logout-then-login', async () => {
    // 1) Chris login starts. POST /auth/login returns a token; /auth/me is
    //    deferred — the hydrate will sit on it indefinitely until we resolve
    //    chrisMeDefer manually below. This simulates a slow-network /auth/me
    //    response that doesn't arrive until the user has moved on.
    let resolveChrisMe: (v: unknown) => void = () => {};
    const chrisMeDefer = new Promise((resolve) => {
      resolveChrisMe = resolve;
    });

    mockApiPost.mockResolvedValueOnce({ accessToken: 'chris-token', tokenType: 'bearer' });
    mockApiGet.mockReturnValueOnce(chrisMeDefer);

    // Kick off Chris's login. Don't await — we want it pending while the
    // logout + Sarah login race ahead.
    const chrisLogin = useAuthStore.getState().login('chris@example.com', 'password123');

    // Yield so the hydrate has a chance to run setToken('chris-token') and
    // queue the /auth/me request before we move on.
    await Promise.resolve();
    await Promise.resolve();

    // 2) Logout. This MUST bump the auth-op version before the SecureStore
    //    delete await so a stale /auth/me resolution is invalidated.
    await useAuthStore.getState().logout();

    // 3) Sarah login lands FULLY and synchronously (her /auth/me resolves
    //    immediately so her identity is committed before Chris's /auth/me
    //    finally arrives below).
    mockApiPost.mockResolvedValueOnce({ accessToken: 'sarah-token', tokenType: 'bearer' });
    mockApiGet.mockResolvedValueOnce({ ...FAKE_ME, id: 'sarah-id', email: 'sarah@example.com' });
    await useAuthStore.getState().login('sarah@example.com', 'password123');

    // Sanity: the store is Sarah at this point.
    expect(useAuthStore.getState().user?.id).toBe('sarah-id');
    expect(useAuthStore.getState().token).toBe('sarah-token');

    // 4) Chris's /auth/me FINALLY resolves. Without the guard, this would
    //    set user = Chris, leaving the api module token = sarah-token but
    //    user = Chris (or worse, also re-pin the api token). With the guard
    //    the result is dropped silently — Sarah's identity stays intact.
    resolveChrisMe({ ...FAKE_ME, id: 'chris-id', email: 'chris@example.com' });
    await chrisLogin;

    expect(useAuthStore.getState().user?.id).toBe('sarah-id');
    expect(useAuthStore.getState().token).toBe('sarah-token');
    // The last setToken call must be for Sarah, NOT for null (the catch
    // path) and NOT for Chris's token: Chris's hydrate must observe a stale
    // op before re-pinning the api token.
    expect(mockSetToken).toHaveBeenLastCalledWith('sarah-token');
  });

  it('drops a stale initialize /auth/me result that resolves AFTER a later login', async () => {
    // SecureStore returns Chris's stored token on cold start.
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('chris-token');

    // initialize's /auth/me is deferred — slow cold-start network.
    let resolveInitMe: (v: unknown) => void = () => {};
    const initMeDefer = new Promise((resolve) => {
      resolveInitMe = resolve;
    });
    mockApiGet.mockReturnValueOnce(initMeDefer);

    const initPromise = useAuthStore.getState().initialize();

    // Let initialize() reach its /auth/me await.
    await Promise.resolve();
    await Promise.resolve();

    // User logs in as Sarah while init's /auth/me is still hanging.
    mockApiPost.mockResolvedValueOnce({ accessToken: 'sarah-token', tokenType: 'bearer' });
    mockApiGet.mockResolvedValueOnce({ ...FAKE_ME, id: 'sarah-id', email: 'sarah@example.com' });
    await useAuthStore.getState().login('sarah@example.com', 'password123');

    expect(useAuthStore.getState().user?.id).toBe('sarah-id');

    // Now initialize's /auth/me arrives with the OLD Chris user. Without a
    // guard, set({ token: chris-token, user: Chris }) would clobber Sarah.
    resolveInitMe({ ...FAKE_ME, id: 'chris-id', email: 'chris@example.com' });
    await initPromise;

    expect(useAuthStore.getState().user?.id).toBe('sarah-id');
    expect(useAuthStore.getState().token).toBe('sarah-token');
  });
});
