/**
 * TournamentCard tests — visual surface for the Tournaments list.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { TournamentCard } from '../components/TournamentCard';
import type { TournamentSummary } from '@sportsgang/shared-types';

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#000', brandSoft: '#222', border: '#ccc',
    surface: '#fff', surfaceElevated: '#f5f5f5', background: '#fafafa',
    separator: '#e0e0e0', textPrimary: '#000', textSecondary: '#555',
    textTertiary: '#888', textInverse: '#fff', success: '#0f0', error: '#f00',
    inputBackground: '#eee',
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

describe('TournamentCard', () => {
  it('renders title, sport tag, area, and spots-left', () => {
    const { getByText } = render(
      <TournamentCard tournament={makeTournament()} onPress={jest.fn()} />
    );
    getByText('Bondi Open');
    getByText('TENNIS');
    // The big neon number lives in its own Text node next to a label
    // node so we assert each separately.
    getByText('5');
    getByText(/spots left.*3.*8 joined/);
  });

  it('uses singular "spot left" when only one remains', () => {
    const { getByText } = render(
      <TournamentCard
        tournament={makeTournament({ spotsLeft: 1, participantCount: 7 })}
        onPress={jest.fn()}
      />
    );
    getByText('1');
    // Singular form — must not say "spots".
    getByText(/^spot left.*7.*8 joined/);
  });

  it('shows "You are in" when hasJoined is true', () => {
    const { getByText } = render(
      <TournamentCard
        tournament={makeTournament({ hasJoined: true })}
        onPress={jest.fn()}
      />
    );
    getByText('You are in');
  });

  it('hides spots-left for completed/cancelled status', () => {
    const { queryByText } = render(
      <TournamentCard
        tournament={makeTournament({ status: 'completed' })}
        onPress={jest.fn()}
      />
    );
    // The spots row is hidden for completed tournaments because the
    // information is meaningless after the event happened.
    expect(queryByText(/spots? left/)).toBeNull();
  });

  it('shows status pill with the right copy', () => {
    const open = render(
      <TournamentCard tournament={makeTournament({ status: 'open' })} onPress={jest.fn()} />
    );
    open.getByText('Open');
    open.unmount();

    const full = render(
      <TournamentCard tournament={makeTournament({ status: 'full' })} onPress={jest.fn()} />
    );
    full.getByText('Full');
    full.unmount();

    const cancelled = render(
      <TournamentCard tournament={makeTournament({ status: 'cancelled' })} onPress={jest.fn()} />
    );
    cancelled.getByText('Cancelled');
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <TournamentCard tournament={makeTournament()} onPress={onPress} />
    );
    fireEvent.press(getByLabelText('Open Bondi Open'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does not render bracket / round / seed UI', () => {
    const { queryByText } = render(
      <TournamentCard tournament={makeTournament()} onPress={jest.fn()} />
    );
    // Brackets aren't implemented; the card must not imply they are.
    expect(queryByText(/bracket/i)).toBeNull();
    expect(queryByText(/round/i)).toBeNull();
    expect(queryByText(/seed/i)).toBeNull();
    expect(queryByText(/ranked/i)).toBeNull();
  });
});
