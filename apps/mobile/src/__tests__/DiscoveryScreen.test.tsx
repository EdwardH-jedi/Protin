/**
 * DiscoveryScreen tests
 *
 * Mocks:
 *  - useDiscovery hook (covers api.ts internally)
 *  - React Navigation (DiscoveryScreen does not use navigation props directly,
 *    but Screen component may pull from context)
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { DiscoveryScreen } from '../screens/discovery/DiscoveryScreen';
import type { UseDiscoveryReturn } from '../hooks/useDiscovery';

// ─── Mock useDiscovery ────────────────────────────────────────────────────────

const mockRecordAction = jest.fn();
const mockFetchMore = jest.fn();
const mockSetSport = jest.fn();

const defaultDiscovery: UseDiscoveryReturn = {
  partners: [],
  isLoading: false,
  error: null,
  sport: 'gym',
  setSport: mockSetSport,
  recordAction: mockRecordAction,
  fetchMore: mockFetchMore,
};

jest.mock('../hooks/useDiscovery', () => ({
  useDiscovery: jest.fn(),
  // re-export the PartnerCard type as a value (not needed at runtime)
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
    h2: {}, h3: {}, body: {}, bodySmall: {}, label: {}, button: {},
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const { useDiscovery } = require('../hooks/useDiscovery');

function setupDiscovery(overrides: Partial<UseDiscoveryReturn> = {}) {
  useDiscovery.mockReturnValue({ ...defaultDiscovery, ...overrides });
}

const samplePartner = {
  userId: 'user-1',
  displayName: 'Alex Smith',
  suburb: 'Surry Hills',
  bioExcerpt: 'Love morning lifts.',
  age: 28,
  sportProfiles: [{ sport: 'gym', level: 'intermediate' }],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DiscoveryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator while isLoading is true', () => {
    setupDiscovery({ isLoading: true, partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText('Finding partners...');
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error message and a retry button when error is set', () => {
    setupDiscovery({ error: 'Network error', partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText('Something went wrong');
    getByText('Network error');
    getByText('Try again');
  });

  it('calls fetchMore when the retry button is pressed in error state', () => {
    setupDiscovery({ error: 'Network error', partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    fireEvent.press(getByText('Try again'));
    expect(mockFetchMore).toHaveBeenCalledTimes(1);
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows the empty-state message when partners is empty and not loading', () => {
    setupDiscovery({ partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText("You've seen everyone for now.");
    getByText('Check back soon for new workout partners.');
  });

  it('calls fetchMore when the Refresh button is pressed in empty state', () => {
    setupDiscovery({ partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    fireEvent.press(getByText('Refresh'));
    expect(mockFetchMore).toHaveBeenCalledTimes(1);
  });

  // ── Partner cards ──────────────────────────────────────────────────────────

  it('renders a partner card with display name and suburb', () => {
    setupDiscovery({ partners: [samplePartner] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText('Alex Smith, 28');
    getByText('Surry Hills');
    getByText('Gym · Intermediate');
    getByText('Love morning lifts.');
  });

  it('renders action buttons for a partner card', () => {
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    getByLabelText('Like');
    getByLabelText('Pass');
    getByLabelText('Save');
  });

  // ── Sport toggle ───────────────────────────────────────────────────────────

  it('renders gym and golf sport tabs', () => {
    setupDiscovery({ partners: [] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    getByLabelText('Gym');
    getByLabelText('Golf');
  });

  it('calls setSport with "golf" when the Golf tab is pressed', () => {
    setupDiscovery({ partners: [], sport: 'gym' });
    const { getByLabelText } = render(<DiscoveryScreen />);
    fireEvent.press(getByLabelText('Golf'));
    expect(mockSetSport).toHaveBeenCalledWith('golf');
  });

  it('calls setSport with "gym" when the Gym tab is pressed', () => {
    setupDiscovery({ partners: [], sport: 'golf' });
    const { getByLabelText } = render(<DiscoveryScreen />);
    fireEvent.press(getByLabelText('Gym'));
    expect(mockSetSport).toHaveBeenCalledWith('gym');
  });

  // ── Like action ────────────────────────────────────────────────────────────

  it('calls recordAction with like when Like is pressed', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: false });
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Like'));
    });
    expect(mockRecordAction).toHaveBeenCalledWith('user-1', 'like');
  });

  it('calls recordAction with pass when Pass is pressed', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: false });
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Pass'));
    });
    expect(mockRecordAction).toHaveBeenCalledWith('user-1', 'pass');
  });

  it('calls recordAction with save when Save is pressed', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: false });
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Save'));
    });
    expect(mockRecordAction).toHaveBeenCalledWith('user-1', 'save');
  });

  // ── Match banner ───────────────────────────────────────────────────────────

  it('shows the match banner after a like that results in a match', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: true, matchId: 'match-1' });
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText, queryByText } = render(<DiscoveryScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Like'));
    });

    await waitFor(() => {
      expect(queryByText("It's a match!")).not.toBeNull();
    });
  });

  it('does not show the match banner when matchCreated is false', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: false });
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText, queryByText } = render(<DiscoveryScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Like'));
    });

    expect(queryByText("It's a match!")).toBeNull();
  });

  // ── Action error resilience ────────────────────────────────────────────────

  it('does not throw when recordAction rejects', async () => {
    mockRecordAction.mockRejectedValue(new Error('Server error'));
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);

    await expect(
      act(async () => {
        fireEvent.press(getByLabelText('Like'));
      })
    ).resolves.not.toThrow();
  });

  // ── Header ─────────────────────────────────────────────────────────────────

  it('renders the Discover header and Sydney eyebrow', () => {
    setupDiscovery({ partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText('Discover');
    getByText('Sydney');
  });
});
