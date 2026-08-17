/**
 * TournamentDetailScreen tests
 *
 * Mocks the detail hook so the test focuses on screen state machine:
 * Join visibility, Leave confirmation, no bracket UI, status messaging.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

import { TournamentDetailScreen } from '../screens/tournaments/TournamentDetailScreen';
import type { TournamentDetail } from '@sportsgang/shared-types';

const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockRefresh = jest.fn();

let mockDetailState: {
  detail: TournamentDetail | null;
  isLoading: boolean;
  error: string | null;
};

jest.mock('../hooks/useTournaments', () => ({
  useTournamentDetail: () => ({
    ...mockDetailState,
    join: mockJoin,
    leave: mockLeave,
    refresh: mockRefresh,
  }),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#000', brandSoft: '#222', border: '#ccc',
    surface: '#fff', surfaceElevated: '#f5f5f5', background: '#fafafa',
    separator: '#e0e0e0', textPrimary: '#000', textSecondary: '#555',
    textTertiary: '#888', textInverse: '#fff', inputBackground: '#eee',
    success: '#0f0', error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, pill: 9999, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: {
    h1: {}, h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

jest.mock('../stores/profile', () => ({
  sportLabel: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
}));

function makeDetail(overrides: Partial<TournamentDetail> = {}): TournamentDetail {
  return {
    id: 't1',
    title: 'Bondi Open',
    sport: 'tennis',
    description: 'Friendly Sunday round-robin.',
    area: 'Bondi',
    venueId: null,
    startsAt: '2030-06-01T10:00:00Z',
    capacity: 8,
    participantCount: 3,
    spotsLeft: 5,
    status: 'open',
    hasJoined: false,
    participants: [
      { userId: 'u1', displayName: 'Alex', joinedAt: '2026-05-01T00:00:00Z' },
      { userId: 'u2', displayName: 'Sam', joinedAt: '2026-05-01T01:00:00Z' },
      { userId: 'u3', displayName: 'Chris', joinedAt: '2026-05-01T02:00:00Z' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeNavigation() {
  return { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
}

function makeRoute(tournamentId = 't1') {
  return { params: { tournamentId } };
}

describe('TournamentDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDetailState = {
      detail: makeDetail(),
      isLoading: false,
      error: null,
    };
  });

  it('renders the title, sport tag, area and starts-at row', () => {
    const { getByText } = render(
      <TournamentDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    getByText('Bondi Open');
    getByText('TENNIS');
    getByText('Bondi');
  });

  it('renders an ordered participant list (no seeds, no rounds)', () => {
    const { getByText, queryByText } = render(
      <TournamentDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    getByText('Alex');
    getByText('Sam');
    getByText('Chris');
    // Bracket / round / seed UI must not appear.
    expect(queryByText(/round 1/i)).toBeNull();
    expect(queryByText(/seed/i)).toBeNull();
    expect(queryByText(/bracket/i)).toBeNull();
    expect(queryByText(/draw/i)).toBeNull();
  });

  it('shows the Join button for an open tournament when not joined', () => {
    const { getByLabelText } = render(
      <TournamentDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    getByLabelText('Join tournament');
  });

  it('hides Join and shows Leave when already joined', () => {
    mockDetailState.detail = makeDetail({ hasJoined: true });
    const { queryByLabelText, getByLabelText } = render(
      <TournamentDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    expect(queryByLabelText('Join tournament')).toBeNull();
    getByLabelText('Leave tournament');
  });

  it('hides Join when status is full', () => {
    mockDetailState.detail = makeDetail({ status: 'full', spotsLeft: 0 });
    const { queryByLabelText, getByText } = render(
      <TournamentDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    expect(queryByLabelText('Join tournament')).toBeNull();
    getByText('This tournament is full.');
  });

  it('hides Join when status is cancelled and shows the right hint', () => {
    mockDetailState.detail = makeDetail({ status: 'cancelled' });
    const { queryByLabelText, getByText } = render(
      <TournamentDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    expect(queryByLabelText('Join tournament')).toBeNull();
    getByText('This tournament was cancelled.');
  });

  it('calls join() when the Join button is pressed', async () => {
    mockJoin.mockResolvedValue(undefined);
    const { getByLabelText } = render(
      <TournamentDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Join tournament'));
    });
    expect(mockJoin).toHaveBeenCalled();
  });

  it('shows a confirmation Alert before leaving and calls leave() on confirm', async () => {
    mockDetailState.detail = makeDetail({ hasJoined: true });
    mockLeave.mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText } = render(
      <TournamentDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );

    fireEvent.press(getByLabelText('Leave tournament'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('Leave tournament?');

    const buttons = alertSpy.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void | Promise<void>;
    }[];
    const destructive = buttons.find((b) => b.style === 'destructive');
    await act(async () => {
      await destructive?.onPress?.();
    });
    expect(mockLeave).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('shows an error state with retry when error is set', async () => {
    mockDetailState = { detail: null, isLoading: false, error: 'Network down' };
    const { getByText, getByLabelText } = render(
      <TournamentDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText('Network down'));
    fireEvent.press(getByLabelText('Retry loading tournament'));
    expect(mockRefresh).toHaveBeenCalled();
  });
});
