/**
 * OnboardingStep1Screen tests
 *
 * Mocks:
 *  - stores/profile (useProfileStore)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { OnboardingStep1Screen } from '../screens/onboarding/OnboardingStep1Screen';

// ─── Mock profile store ───────────────────────────────────────────────────────

const mockUpsertProfile = jest.fn();

jest.mock('../stores/profile', () => ({
  useProfileStore: jest.fn(),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation() {
  return { navigate: jest.fn(), replace: jest.fn() };
}

function setupStore() {
  const { useProfileStore } = require('../stores/profile');
  (useProfileStore as jest.Mock).mockReturnValue({ upsertProfile: mockUpsertProfile });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingStep1Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the step indicator', () => {
    const { getByText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Step 1 of 3');
  });

  it('renders the profile title', () => {
    const { getByText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Your profile');
  });

  it('renders all form fields', () => {
    const { getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByPlaceholderText("How you'll appear to others");
    getByPlaceholderText('e.g. 1990');
    getByPlaceholderText('e.g. Surry Hills');
    getByPlaceholderText('Tell potential partners a bit about yourself...');
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('requires display name', async () => {
    const { getByText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Please enter a display name.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('rejects a birth year below 1940', async () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), 'Jordan');
    fireEvent.changeText(getByPlaceholderText('e.g. 1990'), '1920');
    fireEvent.press(getByText('Continue'));
    await waitFor(() =>
      getByText('Please enter a valid birth year between 1940 and 2005.')
    );
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('rejects a birth year above 2005', async () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), 'Jordan');
    fireEvent.changeText(getByPlaceholderText('e.g. 1990'), '2010');
    fireEvent.press(getByText('Continue'));
    await waitFor(() =>
      getByText('Please enter a valid birth year between 1940 and 2005.')
    );
  });

  // ── Calculated age hint ────────────────────────────────────────────────────

  it('shows calculated age when a valid birth year is entered', () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('e.g. 1990'), '1990');
    const expectedAge = new Date().getFullYear() - 1990;
    getByText(`Age: ${expectedAge}`);
  });

  // ── Successful submit ──────────────────────────────────────────────────────

  it('calls upsertProfile with correct data', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), 'Jordan Lee');
    fireEvent.changeText(getByPlaceholderText('e.g. 1990'), '1990');
    fireEvent.changeText(getByPlaceholderText('e.g. Surry Hills'), 'Newtown');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => {
      expect(mockUpsertProfile).toHaveBeenCalledWith({
        displayName: 'Jordan Lee',
        birthYear: 1990,
        suburb: 'Newtown',
        bio: undefined,
      });
    });
  });

  it('navigates to OnboardingStep2 on success', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), 'Jordan');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledWith('OnboardingStep2');
    });
  });

  // ── API error ──────────────────────────────────────────────────────────────

  it('shows error message when upsertProfile fails', async () => {
    mockUpsertProfile.mockRejectedValue(new Error('Server error'));
    const nav = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), 'Jordan');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Server error'));
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});
