/**
 * SplashScreen tests
 *
 * Mocks:
 *  - stores/auth (useAuthStore.getState)
 *  - theme
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';

import { SplashScreen } from '../screens/SplashScreen';

// ─── Mock auth store ──────────────────────────────────────────────────────────

const mockInitialize = jest.fn();
const mockGetState = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: Object.assign(jest.fn(() => ({})), {
    getState: (...args: unknown[]) => mockGetState(...args),
  }),
}));

// ─── Mock theme ───────────────────────────────────────────────────────────────

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#000', border: '#ccc', surface: '#fff',
    surfaceElevated: '#f5f5f5', background: '#fafafa', separator: '#e0e0e0',
    textPrimary: '#000', textSecondary: '#555', textTertiary: '#888',
    textInverse: '#fff', success: '#0f0', error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: {
    h1: {}, h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SplashScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the PROTIN wordmark', () => {
    mockGetState.mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      token: null,
    });
    const nav = { replace: jest.fn() };
    const { getByText } = render(
      <SplashScreen navigation={nav as any} route={{} as any} />
    );
    getByText('PROTIN');
  });

  // ── Navigation with token ──────────────────────────────────────────────────

  it('navigates to Main when a token is found after init', async () => {
    mockInitialize.mockResolvedValue(undefined);
    mockGetState
      .mockReturnValueOnce({ initialize: mockInitialize, token: null }) // first call — get initialize()
      .mockReturnValueOnce({ initialize: mockInitialize, token: 'valid-token' }); // second call — get token

    const nav = { replace: jest.fn() };
    render(<SplashScreen navigation={nav as any} route={{} as any} />);

    await act(async () => {
      jest.advanceTimersByTime(1100);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(nav.replace).toHaveBeenCalledWith('Main');
  });

  // ── Navigation without token ───────────────────────────────────────────────

  it('navigates to AuthEntry when no token is found after init', async () => {
    mockInitialize.mockResolvedValue(undefined);
    mockGetState.mockReturnValue({ initialize: mockInitialize, token: null });

    const nav = { replace: jest.fn() };
    render(<SplashScreen navigation={nav as any} route={{} as any} />);

    await act(async () => {
      jest.advanceTimersByTime(1100);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(nav.replace).toHaveBeenCalledWith('AuthEntry');
  });
});
