/**
 * HonorCard tests
 *
 * Covers: loading state, error state, empty state, populated render,
 * truthful copy (no popularity / no AI moderation claims).
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import { HonorCard } from '../components/HonorCard';
import type { HonorSummary } from '@sportsgang/shared-types';

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

function makeSummary(overrides: Partial<HonorSummary> = {}): HonorSummary {
  return {
    userId: 'u1',
    honorScore: 102,
    honorLevel: 'Regular',
    gangScore: 25,
    completedGamesCount: 2,
    hostedGamesCount: 1,
    noShowCount: 0,
    excusedCount: 0,
    pendingCount: 0,
    sportLevels: [
      {
        sport: 'basketball',
        xp: 25,
        level: 1,
        attendedCount: 2,
        hostedCount: 1,
      },
    ],
    generatedAt: '2026-05-11T00:00:00Z',
    ...overrides,
  };
}

describe('HonorCard', () => {
  it('renders the loading state when isLoading and no summary', () => {
    const { getByLabelText } = render(<HonorCard summary={null} isLoading />);
    getByLabelText('Honor card loading');
  });

  it('renders the error state when error is set and no summary', () => {
    const { getByLabelText, getByText } = render(
      <HonorCard summary={null} error="Network down" />
    );
    getByLabelText('Honor card error');
    getByText('Network down');
  });

  it('renders the empty state with friendly copy', () => {
    const { getByText } = render(<HonorCard summary={null} />);
    getByText('Play your first game to start building your Honor.');
  });

  it('renders Honor level, Honor score, Gang score, and counts', () => {
    const { getByText } = render(<HonorCard summary={makeSummary()} />);
    getByText('102');
    getByText('Regular');
    getByText('25');
    // Stats grid:
    getByText('Completed games');
    getByText('Hosted games');
    getByText('No-shows');
  });

  it('renders the no-show count when present', () => {
    const { getByLabelText } = render(
      <HonorCard summary={makeSummary({ noShowCount: 3 })} />
    );
    getByLabelText('No-shows: 3');
  });

  it('renders sport levels when supplied', () => {
    const { getByText } = render(<HonorCard summary={makeSummary()} />);
    getByText('Basketball');
    getByText('Lv 1 · 25 XP');
  });

  it('copy does not describe Honor as popularity', () => {
    const { queryByText } = render(<HonorCard summary={makeSummary()} />);
    expect(queryByText(/popular/i)).toBeNull();
    expect(queryByText(/popularity/i)).toBeNull();
  });

  it('copy does not claim AI moderation or instant enforcement', () => {
    const { queryByText } = render(<HonorCard summary={makeSummary()} />);
    expect(queryByText(/AI moderation/i)).toBeNull();
    expect(queryByText(/instant/i)).toBeNull();
    expect(queryByText(/auto.?ban/i)).toBeNull();
  });

  it('uses the documented Honor body copy', () => {
    const { getByText } = render(<HonorCard summary={makeSummary()} />);
    getByText(
      'Honor reflects attendance, fair play, and reliable hosting.'
    );
    getByText('Gang Score reflects your activity and contribution.');
  });
});
