/**
 * HonorBadge tests
 *
 * Covers: level + score render, compact mode, fallback when summary
 * unavailable, loading state, and truthful copy guarantees.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import { HonorBadge } from '../components/HonorBadge';

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

describe('HonorBadge', () => {
  it('renders the honor level when provided', () => {
    const { getByText } = render(<HonorBadge honorLevel="Trusted" />);
    getByText('Trusted');
  });

  it('renders level and score in full mode with an ASCII hyphen separator', () => {
    const { getByText, queryByText } = render(
      <HonorBadge honorLevel="Trusted" honorScore={126} />
    );
    getByText('Trusted');
    getByText('- 126');
    // Regression guard: the previous middle-dot separator mojibaked to
    // "쨌" in some encodings. Pin that nothing in the rendered tree
    // includes either the middle dot or the mojibake artifact.
    expect(queryByText(/·/)).toBeNull();
    expect(queryByText(/쨌/)).toBeNull();
  });

  it('hides the score in compact mode', () => {
    const { getByText, queryByText } = render(
      <HonorBadge honorLevel="Trusted" honorScore={126} compact />
    );
    getByText('Trusted');
    expect(queryByText('- 126')).toBeNull();
  });

  it('renders the New player fallback when summary unavailable', () => {
    const { getByText, getByLabelText } = render(<HonorBadge />);
    getByText('New player');
    getByLabelText('New player');
  });

  it('renders the loading state when isLoading is true', () => {
    const { getByText, getByLabelText } = render(
      <HonorBadge isLoading />
    );
    getByText('Honor');
    getByLabelText('Honor loading');
  });

  it('uses the provided accessibility label when supplied', () => {
    const { getByLabelText } = render(
      <HonorBadge honorLevel="Captain" accessibilityLabel="Host honor Captain" />
    );
    getByLabelText('Host honor Captain');
  });

  // ── Copy guarantees ───────────────────────────────────────────────────────

  it('copy never describes Honor as popularity or a leaderboard', () => {
    const { queryByText } = render(
      <HonorBadge honorLevel="Trusted" honorScore={126} />
    );
    expect(queryByText(/popular/i)).toBeNull();
    expect(queryByText(/popularity/i)).toBeNull();
    expect(queryByText(/leaderboard/i)).toBeNull();
  });

  it('copy never claims AI moderation or verified identity', () => {
    const { queryByText } = render(
      <HonorBadge honorLevel="Trusted" honorScore={126} />
    );
    expect(queryByText(/AI moderation/i)).toBeNull();
    expect(queryByText(/verified/i)).toBeNull();
  });
});
