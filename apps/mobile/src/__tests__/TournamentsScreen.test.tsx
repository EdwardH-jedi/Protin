/**
 * TournamentsScreen tests
 *
 * Exercises tab switching, list rendering, empty state, and the
 * fail-open feature-flag empty state. The hook is mocked so the test
 * stays focused on the screen.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { TournamentsScreen } from '../screens/tournaments/TournamentsScreen';
import type { TournamentSummary } from '@sportsgang/shared-types';

let mockHookState: {
  items: TournamentSummary[];
  isLoading: boolean;
  error: string | null;
  available: boolean;
};

const mockRefresh = jest.fn();

jest.mock('../hooks/useTournaments', () => ({
  useTournaments: ({ mine }: { mine?: boolean }) => {
    // Track which tab the screen requested so tests can assert it.
    (mockHookState as unknown as { lastMine?: boolean }).lastMine = mine;
    return { ...mockHookState, refresh: mockRefresh };
  },
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
    h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

jest.mock('../stores/profile', () => ({
  sportLabel: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
}));

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };
}

function makeTournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: 't1',
    title: 'Bondi Open',
    sport: 'tennis',
    description: null,
    area: 'Bondi',
    venueId: null,
    startsAt: '2030-06-01T10:00:00Z',
    capacity: 8,
    participantCount: 3,
    spotsLeft: 5,
    status: 'open',
    hasJoined: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TournamentsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHookState = {
      items: [],
      isLoading: false,
      error: null,
      available: true,
    };
  });

  it('renders the tab bar with Open and My tournaments tabs', () => {
    const { getByLabelText } = render(
      <TournamentsScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByLabelText('Open tournaments');
    getByLabelText('My tournaments');
  });

  it('renders a tournament card from items', () => {
    mockHookState.items = [makeTournament({ title: 'Bondi Open' })];
    const { getByText } = render(
      <TournamentsScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Bondi Open');
  });

  it('shows "Tournaments coming soon" empty state when available is false', () => {
    mockHookState.available = false;
    const { getByText } = render(
      <TournamentsScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Tournaments coming soon');
  });

  it('shows "no open tournaments" empty state when list is empty and available', () => {
    const { getByText } = render(
      <TournamentsScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('No open tournaments');
  });

  it('switches the hook to mine=true when My tournaments tab is selected', () => {
    const { getByLabelText } = render(
      <TournamentsScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('My tournaments'));
    expect((mockHookState as unknown as { lastMine?: boolean }).lastMine).toBe(true);
  });

  it('shows "haven\'t joined any" empty state for the My tournaments tab when items empty', () => {
    const { getByLabelText, getByText } = render(
      <TournamentsScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('My tournaments'));
    getByText("You haven't joined any tournaments");
  });

  it('navigates to TournamentDetail when a card is pressed', () => {
    mockHookState.items = [makeTournament({ id: 't-xyz', title: 'Bondi Open' })];
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <TournamentsScreen navigation={navigation as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Open Bondi Open'));
    expect(navigation.navigate).toHaveBeenCalledWith('TournamentDetail', {
      tournamentId: 't-xyz',
    });
  });

  it('calls navigation.goBack when the Back button is pressed', () => {
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <TournamentsScreen navigation={navigation as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('renders a retry button when error is set and refresh fires it', () => {
    mockHookState.error = 'Network down';
    const { getByLabelText, getByText } = render(
      <TournamentsScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Network down');
    fireEvent.press(getByLabelText('Retry loading tournaments'));
    expect(mockRefresh).toHaveBeenCalled();
  });
});
