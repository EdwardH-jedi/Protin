/**
 * OnboardingStep3Screen tests
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

const mockUpsertSportProfile = jest.fn();

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
    upsertSportProfile: mockUpsertSportProfile,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingStep3Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the step indicator', () => {
    const { getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Step 3 of 3');
  });

  it('renders all four sport options', () => {
    const { getByRole } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByRole('checkbox', { name: 'Gym' });
    getByRole('checkbox', { name: 'Golf' });
    getByRole('checkbox', { name: 'Tennis' });
    getByRole('checkbox', { name: 'Running' });
  });

  it('renders the Let\'s go button', () => {
    const { getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText("Let's go");
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('shows error when no sport is selected', async () => {
    const { getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByText("Let's go"));
    await waitFor(() => getByText('Please select at least one sport.'));
    expect(mockUpsertSportProfile).not.toHaveBeenCalled();
  });

  // ── Sport selection ────────────────────────────────────────────────────────

  it('shows sport detail fields when a sport is selected', () => {
    const { getByRole, getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Gym' }));
    // Level radios should appear
    getByText('Beginner');
    getByText('Intermediate');
    getByText('Advanced');
  });

  it('hides detail fields when a sport is deselected', () => {
    const { getByRole, queryByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Gym' }));
    fireEvent.press(getByRole('checkbox', { name: 'Gym' })); // deselect
    expect(queryByText('Beginner')).toBeNull();
  });

  it('shows preferred time slots once a sport is selected', () => {
    const { getByRole, getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Golf' }));
    getByText('Morning');
    getByText('Afternoon');
    getByText('Evening');
    getByText('Flexible');
  });

  // ── Successful submit ──────────────────────────────────────────────────────

  it('calls upsertSportProfile once when a single sport is selected', async () => {
    mockUpsertSportProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByRole, getByText } = render(
      <OnboardingStep3Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Gym' }));
    fireEvent.press(getByText("Let's go"));
    await waitFor(() => {
      expect(mockUpsertSportProfile).toHaveBeenCalledTimes(1);
      expect(mockUpsertSportProfile).toHaveBeenCalledWith(
        expect.objectContaining({ sport: 'gym', level: 'beginner' })
      );
    });
  });

  it('calls upsertSportProfile for each selected sport', async () => {
    mockUpsertSportProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByRole, getByText } = render(
      <OnboardingStep3Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Gym' }));
    fireEvent.press(getByRole('checkbox', { name: 'Golf' }));
    fireEvent.press(getByText("Let's go"));
    await waitFor(() => {
      expect(mockUpsertSportProfile).toHaveBeenCalledTimes(2);
    });
    const sports = mockUpsertSportProfile.mock.calls.map((c: any[]) => c[0].sport);
    expect(sports).toContain('gym');
    expect(sports).toContain('golf');
  });

  it('navigates to Main after successful submission', async () => {
    mockUpsertSportProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByRole, getByText } = render(
      <OnboardingStep3Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Running' }));
    fireEvent.press(getByText("Let's go"));
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith('Main');
    });
  });

  // ── API error ──────────────────────────────────────────────────────────────

  it('shows error message when upsertSportProfile fails', async () => {
    mockUpsertSportProfile.mockRejectedValue(new Error('Save failed'));
    const nav = makeNavigation();
    const { getByRole, getByText } = render(
      <OnboardingStep3Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Tennis' }));
    fireEvent.press(getByText("Let's go"));
    await waitFor(() => getByText('Save failed'));
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
