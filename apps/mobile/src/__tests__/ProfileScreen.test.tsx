/**
 * ProfileScreen tests
 *
 * Mocks:
 *  - ../stores/auth   (useAuthStore → logout)
 *  - ../stores/profile (useProfileStore → profile, sportProfiles, fetchProfile)
 *  - ../lib/api       (api.get, api.delete)
 *  - expo-web-browser (WebBrowser.openAuthSessionAsync)
 *  - ../components/Screen
 *  - ../theme
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { ProfileScreen } from '../screens/profile/ProfileScreen';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

// ─── Mock auth store ──────────────────────────────────────────────────────────

const mockLogout = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: () => ({ logout: mockLogout }),
}));

// ─── Mock profile store ───────────────────────────────────────────────────────

const mockFetchProfile = jest.fn();
let mockProfile: Record<string, unknown> | null = null;
let mockSportProfiles: Array<{ sport: string; level: string }> = [];

jest.mock('../stores/profile', () => ({
  useProfileStore: () => ({
    profile: mockProfile,
    sportProfiles: mockSportProfiles,
    fetchProfile: mockFetchProfile,
  }),
}));

// ─── Mock expo-web-browser ────────────────────────────────────────────────────

const mockOpenAuthSession = jest.fn();

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
}));

// ─── Mock Screen component ────────────────────────────────────────────────────

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// ─── Mock theme ───────────────────────────────────────────────────────────────

jest.mock('../theme', () => ({
  colors: {
    accent: '#000',
    brand: '#000',
    border: '#ccc',
    surface: '#fff',
    surfaceElevated: '#f5f5f5',
    background: '#fafafa',
    separator: '#e0e0e0',
    textPrimary: '#000',
    textSecondary: '#555',
    textTertiary: '#888',
    textInverse: '#fff',
    success: '#0f0',
    error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
  spacing: {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48,
  },
  typography: {
    h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile = null;
    mockSportProfiles = [];
    // Default: fetchProfile resolves immediately, gcal not connected
    mockFetchProfile.mockResolvedValue(undefined);
    mockApiGet.mockResolvedValue({ connected: false });
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator while fetchProfile is pending', () => {
    mockFetchProfile.mockReturnValue(new Promise(() => {}));
    const { UNSAFE_queryAllByType } = render(<ProfileScreen />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  // ── Profile loaded ─────────────────────────────────────────────────────────

  it('renders the display name after profile loads', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Jordan Lee'));
  });

  it('renders suburb when present', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: 'Newtown', bio: null };
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Newtown'));
  });

  it('renders bio when present', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: 'Early morning gym sessions only.' };
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Early morning gym sessions only.'));
  });

  it('renders sport profiles with capitalised level', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    mockSportProfiles = [{ sport: 'gym', level: 'intermediate' }];
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => {
      getByText('Gym');
      getByText('Intermediate');
    });
  });

  // ── Empty / not-yet-created profile ───────────────────────────────────────

  it('shows "Profile not set up" when profile is null and fetchProfile resolves', async () => {
    mockProfile = null;
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Profile not set up'));
  });

  it('does not show an error when fetchProfile rejects with a 404', async () => {
    mockFetchProfile.mockRejectedValue(new Error('404 not found'));
    const { queryByText, getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Profile not set up'));
    expect(queryByText(/404/)).toBeNull();
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error message when fetchProfile rejects with a non-404 error', async () => {
    mockFetchProfile.mockRejectedValue(new Error('Server error'));
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Server error'));
  });

  // ── Google Calendar integration ────────────────────────────────────────────

  it('shows "Connect Google Calendar" when gcal is not connected', async () => {
    mockApiGet.mockResolvedValue({ connected: false });
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Connect Google Calendar'));
  });

  it('shows "Disconnect" when gcal is already connected', async () => {
    mockApiGet.mockResolvedValue({ connected: true });
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Disconnect'));
  });

  it('calls api.delete and hides Disconnect after pressing it', async () => {
    mockApiGet.mockResolvedValue({ connected: true });
    mockApiDelete.mockResolvedValue(undefined);
    const { getByText, queryByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Disconnect'));
    await act(async () => {
      fireEvent.press(getByText('Disconnect'));
    });
    expect(mockApiDelete).toHaveBeenCalledWith('/users/me/google-calendar/disconnect');
    await waitFor(() => expect(queryByText('Disconnect')).toBeNull());
  });

  it('opens the auth browser when Connect Google Calendar is pressed', async () => {
    mockApiGet
      .mockResolvedValueOnce({ connected: false })          // status check on mount
      .mockResolvedValueOnce({ url: 'https://accounts.google.com/o/oauth2/auth?...' }) // auth-url
      .mockResolvedValueOnce({ connected: false });         // status re-check after browser
    mockOpenAuthSession.mockResolvedValue({ type: 'dismiss' });

    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Connect Google Calendar'));
    await act(async () => {
      fireEvent.press(getByText('Connect Google Calendar'));
    });

    expect(mockOpenAuthSession).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/auth?...'
    );
  });

  // ── Logout ─────────────────────────────────────────────────────────────────

  it('calls logout when Log out is pressed', async () => {
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Log out'));
    fireEvent.press(getByLabelText('Log out'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
