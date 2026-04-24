/**
 * OnboardingStep3Screen tests (identity preferences, renumbered to 3 of 4
 * after Slice B inserted photos + bio as Step 2).
 *
 * Mocks:
 *  - stores/profile (useProfileStore)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { OnboardingStep3Screen } from '../screens/onboarding/OnboardingStep3Screen';

// ─── Mock profile store ───────────────────────────────────────────────────────

const mockUpsertIdentityPreferences = jest.fn();

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
  (useProfileStore as jest.Mock).mockReturnValue({
    upsertIdentityPreferences: mockUpsertIdentityPreferences,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingStep3Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the step indicator for 4-step flow', () => {
    const { getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Step 3 of 4');
  });

  it('renders the preference options', () => {
    const { getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Any');
    getByText('Men');
    getByText('Women');
    getByText('Non-binary');
  });

  it('renders the distance options', () => {
    const { getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('5 km');
    getByText('10 km');
    getByText('20 km');
    getByText('50 km');
  });

  // ── Open-to toggles ────────────────────────────────────────────────────────

  it('starts with Any selected', () => {
    const { getByRole } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    const anyCheckbox = getByRole('checkbox', { name: 'Any' });
    expect(anyCheckbox.props.accessibilityState.checked).toBe(true);
  });

  it('deselects Any when another option is tapped', () => {
    const { getByRole } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Men' }));
    expect(getByRole('checkbox', { name: 'Any' }).props.accessibilityState.checked).toBe(false);
    expect(getByRole('checkbox', { name: 'Men' }).props.accessibilityState.checked).toBe(true);
  });

  it('resets to Any when the last non-any option is deselected', () => {
    const { getByRole } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Women' }));
    fireEvent.press(getByRole('checkbox', { name: 'Women' })); // deselect
    expect(getByRole('checkbox', { name: 'Any' }).props.accessibilityState.checked).toBe(true);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('shows error for an invalid age range (min > max)', async () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('18'), '50');
    fireEvent.changeText(getByPlaceholderText('65'), '30');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Please enter a valid age range (18–65).'));
    expect(mockUpsertIdentityPreferences).not.toHaveBeenCalled();
  });

  it('shows error when min age is below 18', async () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('18'), '16');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Please enter a valid age range (18–65).'));
  });

  // ── Successful submit ──────────────────────────────────────────────────────

  it('calls upsertIdentityPreferences with correct defaults', async () => {
    mockUpsertIdentityPreferences.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText } = render(
      <OnboardingStep3Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => {
      expect(mockUpsertIdentityPreferences).toHaveBeenCalledWith({
        openTo: ['any'],
        ageRangeMin: 18,
        ageRangeMax: 65,
        maxDistanceKm: 20,
      });
    });
  });

  it('navigates to OnboardingStep4 on success', async () => {
    mockUpsertIdentityPreferences.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText } = render(
      <OnboardingStep3Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledWith('OnboardingStep4');
    });
  });

  // ── API error ──────────────────────────────────────────────────────────────

  it('shows error message when upsertIdentityPreferences fails', async () => {
    mockUpsertIdentityPreferences.mockRejectedValue(new Error('Network error'));
    const nav = makeNavigation();
    const { getByText } = render(
      <OnboardingStep3Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Network error'));
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});
