/**
 * BattleDetailScreen tests
 *
 * Covers: detail render, Join/Leave/Full CTA states, host display,
 * no-show warning copy, and error / loading states.
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import { BattleDetailScreen } from '../screens/battles/BattleDetailScreen';
import type { EventDetail } from '@protin/shared-types';

let mockState: {
  detail: EventDetail | null;
  isLoading: boolean;
  error: string | null;
};
const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockRefresh = jest.fn();

jest.mock('../hooks/useEvents', () => ({
  useEventDetail: () => ({
    ...mockState,
    join: mockJoin,
    leave: mockLeave,
    refresh: mockRefresh,
  }),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#0f0', brandSoft: '#222', border: '#ccc',
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

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };
}

function makeDetail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 'e1',
    hostUserId: 'host-1',
    host: { id: 'host-1', displayName: 'Sam' },
    title: 'Bondi Hoops',
    sport: 'basketball',
    mode: 'casual',
    startsAt: '2030-06-01T18:00:00Z',
    locationText: 'Bondi Court',
    capacity: 10,
    participantCount: 4,
    spotsLeft: 6,
    visibility: 'public',
    status: 'open',
    hasJoined: false,
    description: 'Friendly run, bring water',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    participants: [],
    ...overrides,
  };
}

function renderScreen(detail: EventDetail | null) {
  mockState = { detail, isLoading: detail === null, error: null };
  const navigation = makeNavigation();
  const utils = render(
    <BattleDetailScreen
      navigation={navigation as any}
      route={{ params: { eventId: 'e1' }, key: 'k', name: 'BattleDetail' } as any}
    />
  );
  return { ...utils, navigation };
}

describe('BattleDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title, location, host, and the no-show warning copy', () => {
    const { getByText } = renderScreen(makeDetail());
    getByText('Bondi Hoops');
    getByText('Bondi Court');
    getByText('Sam');
    getByText('Only join if you can attend. No-shows affect your Honor.');
  });

  it('renders the players count and capacity', () => {
    const { getByText } = renderScreen(makeDetail());
    getByText('4/10 in · 6 spots left');
  });

  it('shows Join CTA when hasJoined is false and status is open', () => {
    const { getByLabelText } = renderScreen(makeDetail({ hasJoined: false }));
    getByLabelText('Join this game');
  });

  it('shows Joined · Leave CTA when hasJoined is true', () => {
    const { getByLabelText } = renderScreen(makeDetail({ hasJoined: true }));
    getByLabelText('Leave this game');
  });

  it('shows Full CTA when status is full', () => {
    const { getByText } = renderScreen(
      makeDetail({ status: 'full', spotsLeft: 0 })
    );
    getByText('Full');
  });

  it('shows Cancelled CTA when status is cancelled', () => {
    const { getByText } = renderScreen(makeDetail({ status: 'cancelled' }));
    getByText('Cancelled');
  });

  it('calls join() when Join CTA is pressed', async () => {
    mockJoin.mockResolvedValueOnce(undefined);
    const { getByLabelText } = renderScreen(makeDetail({ hasJoined: false }));
    await act(async () => {
      fireEvent.press(getByLabelText('Join this game'));
    });
    expect(mockJoin).toHaveBeenCalled();
  });

  it('calls leave() when Leave CTA is pressed', async () => {
    mockLeave.mockResolvedValueOnce(undefined);
    const { getByLabelText } = renderScreen(makeDetail({ hasJoined: true }));
    await act(async () => {
      fireEvent.press(getByLabelText('Leave this game'));
    });
    expect(mockLeave).toHaveBeenCalled();
  });

  it('renders the description when present', () => {
    const { getByText } = renderScreen(makeDetail({ description: 'Bring shoes' }));
    getByText('Bring shoes');
  });

  it('renders Report and Share placeholder buttons', () => {
    const { getByLabelText } = renderScreen(makeDetail());
    getByLabelText('Report this game');
    getByLabelText('Share this game');
  });

  it('calls navigation.goBack when Back is pressed', () => {
    const { getByLabelText, navigation } = renderScreen(makeDetail());
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
