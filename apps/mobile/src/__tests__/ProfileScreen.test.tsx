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
import { Alert } from 'react-native';
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

// ─── Mock @react-navigation/native ────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockReset = jest.fn();
const mockGetParent = jest.fn(() => ({ reset: mockReset }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    reset: mockReset,
    getParent: mockGetParent,
  }),
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
  SPORT_LABELS: { gym: 'Gym', golf: 'Golf', tennis: 'Tennis', running: 'Running' },
  sportLabel: (sport: string) => {
    const labels: Record<string, string> = { gym: 'Gym', golf: 'Golf', tennis: 'Tennis', running: 'Running' };
    return labels[sport] ?? sport.charAt(0).toUpperCase() + sport.slice(1);
  },
}));

// ─── Mock useRankSummary hook ─────────────────────────────────────────────────
// The hook is unit-tested via RankSummaryCard; the ProfileScreen tests only
// need to assert what the screen does with each summary state.

let mockRankSummary:
  | { honor: number; sports: { sport: string; rankPoints: number; tier: string; sessionsCompleted: number }[] }
  | null = null;
let mockRankLoading = false;

jest.mock('../hooks/useRankSummary', () => ({
  useRankSummary: () => ({
    summary: mockRankSummary,
    isLoading: mockRankLoading,
    error: null,
    refresh: jest.fn(),
  }),
}));

// ─── Mock useTournamentsAvailable hook ────────────────────────────────────────
// The real hook does a one-time GET /tournaments?limit=1 probe. Without a
// dedicated mock, the trailing setState from that probe fires after the
// test body has finished its synchronous run and emits a React act() warning.
// The ProfileScreen tests don't care about tournaments availability — keep
// the stub simple and synchronous.

jest.mock('../hooks/useTournaments', () => ({
  useTournamentsAvailable: () => ({ available: true, isReady: true }),
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
    brandDark: '#222',
    brandDarkest: '#000',
    brandSoft: '#222',
    border: '#ccc',
    surface: '#fff',
    surfaceElevated: '#f5f5f5',
    background: '#fafafa',
    separator: '#e0e0e0',
    textPrimary: '#000',
    textSecondary: '#555',
    textTertiary: '#888',
    textInverse: '#fff',
    inputBackground: '#eee',
    success: '#0f0',
    error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, pill: 9999, full: 9999 },
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
    mockRankSummary = null;
    mockRankLoading = false;
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

  // ── Edit profile ───────────────────────────────────────────────────────────

  it('renders an Edit profile button when profile is loaded', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Edit profile'));
  });

  it('navigates to EditProfile when Edit profile is pressed', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Edit profile'));
    fireEvent.press(getByLabelText('Edit profile'));
    expect(mockNavigate).toHaveBeenCalledWith('EditProfile');
  });

  it('does not render Edit profile when no profile exists', async () => {
    mockProfile = null;
    const { queryByLabelText, getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Profile not set up'));
    expect(queryByLabelText('Edit profile')).toBeNull();
  });

  // ── Logout ─────────────────────────────────────────────────────────────────

  it('calls logout and resets navigation to AuthEntry when Log out is pressed', async () => {
    mockLogout.mockResolvedValue(undefined);
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Log out'));
    await act(async () => {
      fireEvent.press(getByLabelText('Log out'));
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    // RootNavigator is not token-gated, so logout must explicitly reset the
    // root stack; otherwise the user stays on the Profile tab with stale data.
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'AuthEntry' }],
    });
  });

  // ── Delete account ─────────────────────────────────────────────────────────

  describe('Delete my account', () => {
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
      alertSpy.mockRestore();
    });

    it('opens a confirmation alert when Delete my account is pressed', async () => {
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0][0]).toBe('Delete your account?');
      expect(mockApiDelete).not.toHaveBeenCalledWith('/auth/me');
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('does nothing when the user cancels the confirmation', async () => {
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));

      // Invoke the Cancel button's onPress (if any). Cancel has no handler,
      // so just verify nothing was called after the alert opened.
      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        style?: string;
        onPress?: () => void;
      }[];
      const cancel = buttons.find((b) => b.text === 'Cancel');
      expect(cancel).toBeDefined();
      expect(cancel?.style).toBe('cancel');
      cancel?.onPress?.();

      expect(mockApiDelete).not.toHaveBeenCalledWith('/auth/me');
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('calls DELETE /auth/me, logs out, and resets to AuthEntry on confirm', async () => {
      mockApiDelete.mockResolvedValue(undefined);
      mockLogout.mockResolvedValue(undefined);
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        style?: string;
        onPress?: () => void | Promise<void>;
      }[];
      const destructive = buttons.find((b) => b.style === 'destructive');
      expect(destructive).toBeDefined();

      await act(async () => {
        await destructive?.onPress?.();
      });

      expect(mockApiDelete).toHaveBeenCalledWith('/auth/me');
      expect(mockLogout).toHaveBeenCalledTimes(1);
      // Navigation reset must hit the *parent* (root) stack — that is where
      // AuthEntry is registered. Resetting only the tab navigator would
      // leave the user inside the authenticated stack.
      expect(mockGetParent).toHaveBeenCalled();
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'AuthEntry' }],
      });
      // logout must be called BEFORE reset so the reset never re-renders
      // Profile against the stale (just-deleted) account's state.
      const logoutOrder = mockLogout.mock.invocationCallOrder[0];
      const resetOrder = mockReset.mock.invocationCallOrder.at(-1)!;
      expect(logoutOrder).toBeLessThan(resetOrder);
    });

    // (Rank summary integration tests are at the bottom of the describe block.)
    // ── placeholder for collocation marker ─────────────────────────────────

    it('shows a failure alert and does not log out or reset nav when delete rejects', async () => {
      mockApiDelete.mockRejectedValue(new Error('500 server error'));
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        style?: string;
        onPress?: () => void | Promise<void>;
      }[];
      const destructive = buttons.find((b) => b.style === 'destructive');

      await act(async () => {
        await destructive?.onPress?.();
      });

      expect(mockApiDelete).toHaveBeenCalledWith('/auth/me');
      // Failed deletion must not clear the local session or send the user
      // to AuthEntry — otherwise the user is stranded in a logged-out state
      // even though their account still exists on the server.
      expect(mockLogout).not.toHaveBeenCalled();
      expect(mockReset).not.toHaveBeenCalled();
      // Second alert call is the failure message
      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(alertSpy.mock.calls[1][0]).toBe('Delete failed');
    });
  });

  // ── Sports reputation (rank/honor) integration ─────────────────────────────

  describe('rank summary section', () => {
    it('renders the section title once a profile exists', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      mockRankSummary = null;
      const { getByText } = render(<ProfileScreen />);
      await waitFor(() => getByText('Sports reputation'));
    });

    it('renders honor + tier rows when a real summary is present', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      mockRankSummary = {
        honor: 105,
        sports: [
          { sport: 'tennis', rankPoints: 10, tier: 'Bronze', sessionsCompleted: 2 },
        ],
      };
      const { getByText } = render(<ProfileScreen />);
      await waitFor(() => {
        getByText('105');
        getByText('Tennis');
        getByText('Bronze');
      });
    });

    it('handles a missing summary gracefully — empty state, no fake numbers', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      mockRankSummary = null;
      const { getByText, queryByText } = render(<ProfileScreen />);
      await waitFor(() => getByText('No reputation yet'));
      // Critical: a brand-new user must NOT see invented values that imply
      // they have a tier/rank. The empty state must be the only thing.
      expect(queryByText('Rookie')).toBeNull();
      expect(queryByText('Bronze')).toBeNull();
      expect(queryByText('100')).toBeNull();
      expect(queryByText('/200')).toBeNull();
    });

    it('does not render the section when no profile exists', async () => {
      mockProfile = null;
      const { queryByText, getByText } = render(<ProfileScreen />);
      await waitFor(() => getByText('Profile not set up'));
      // The reputation card lives in the same cardStack as the profile
      // cards — both should be hidden when there's no profile yet.
      expect(queryByText('Sports reputation')).toBeNull();
    });
  });
});
