/**
 * OnboardingStep1Screen tests (Slice A — basic info required fields).
 *
 * Display name is a free-text TextInput; birth year and suburb are bounded
 * Select pickers. Interaction pattern for the pickers in tests:
 *   1. Press the trigger by accessibilityLabel to open the modal.
 *   2. Press the desired option by its visible text.
 *
 * Mocks:
 *  - stores/profile (useProfileStore)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import {
  MAX_BIRTH_YEAR,
  MIN_BIRTH_YEAR,
  OnboardingStep1Screen,
  buildYearOptions,
} from '../screens/onboarding/OnboardingStep1Screen';

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

function fillRequired(
  utils: ReturnType<typeof render>,
  overrides: { name?: string; year?: string; suburb?: string } = {}
) {
  const { getByPlaceholderText, getByLabelText, getAllByText } = utils;
  const name = overrides.name ?? 'Jordan Lee';
  const year = overrides.year ?? '1990';
  const suburb = overrides.suburb ?? 'Newtown';

  fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), name);

  fireEvent.press(getByLabelText('Birth year'));
  fireEvent.press(getAllByText(year)[0]);

  fireEvent.press(getByLabelText('Sydney suburb'));
  fireEvent.press(getAllByText(suburb)[0]);
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

  it('renders the required basic-info fields', () => {
    const { getByPlaceholderText, getByLabelText, queryByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByPlaceholderText("How you'll appear to others");
    getByLabelText('Birth year');
    getByLabelText('Sydney suburb');
    // Bio moved to Step 2 (Slice B) — Step 1 must no longer render the bio field.
    expect(queryByPlaceholderText('Tell potential partners a bit about yourself...')).toBeNull();
  });

  // ── Year option bounds ─────────────────────────────────────────────────────

  describe('buildYearOptions', () => {
    it('respects the intended [MIN_BIRTH_YEAR, MAX_BIRTH_YEAR] bounds', () => {
      const options = buildYearOptions();
      expect(options.length).toBeGreaterThan(0);

      const years = options.map((o) => parseInt(o.value, 10));
      expect(Math.max(...years)).toBe(MAX_BIRTH_YEAR);
      expect(Math.min(...years)).toBe(MIN_BIRTH_YEAR);

      // No year outside the bounds
      expect(years.every((y) => y >= MIN_BIRTH_YEAR && y <= MAX_BIRTH_YEAR)).toBe(true);

      // Enforces min-age 18 (no year newer than today - 18)
      const minAge = new Date().getFullYear() - MAX_BIRTH_YEAR;
      expect(minAge).toBe(18);
    });

    it('lists years newest-first so common selections are near the top', () => {
      const options = buildYearOptions();
      const first = parseInt(options[0]!.value, 10);
      const last = parseInt(options[options.length - 1]!.value, 10);
      expect(first).toBe(MAX_BIRTH_YEAR);
      expect(last).toBe(MIN_BIRTH_YEAR);
    });
  });

  // ── Validation — required fields ───────────────────────────────────────────

  it('requires display name', async () => {
    const { getByText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Please enter a display name.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only display name', async () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), '   ');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Please enter a display name.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('requires birth year after display name is filled', async () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), 'Jordan');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Please select your birth year.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('requires suburb after display name and birth year are filled', async () => {
    const utils = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(utils.getByPlaceholderText("How you'll appear to others"), 'Jordan');
    fireEvent.press(utils.getByLabelText('Birth year'));
    fireEvent.press(utils.getAllByText('1990')[0]);
    fireEvent.press(utils.getByText('Continue'));
    await waitFor(() => utils.getByText('Please select your Sydney suburb.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  // ── Calculated age hint ────────────────────────────────────────────────────

  it('shows calculated age after selecting a birth year', () => {
    const utils = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(utils.getByLabelText('Birth year'));
    fireEvent.press(utils.getAllByText('1990')[0]);
    const expectedAge = new Date().getFullYear() - 1990;
    utils.getByText(`Age: ${expectedAge}`);
  });

  // ── Successful submit ──────────────────────────────────────────────────────

  it('calls upsertProfile with correct data when all required fields are set', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const utils = render(
      <OnboardingStep1Screen navigation={nav as any} route={{} as any} />
    );
    fillRequired(utils, { name: 'Jordan Lee', year: '1990', suburb: 'Newtown' });
    fireEvent.press(utils.getByText('Continue'));
    await waitFor(() => {
      expect(mockUpsertProfile).toHaveBeenCalledWith({
        displayName: 'Jordan Lee',
        birthYear: 1990,
        suburb: 'Newtown',
      });
    });
  });

  it('trims whitespace from display name before submitting', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    const utils = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fillRequired(utils, { name: '  Jordan Lee  ' });
    fireEvent.press(utils.getByText('Continue'));
    await waitFor(() => {
      expect(mockUpsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Jordan Lee' })
      );
    });
  });

  it('navigates to OnboardingStep2 on success', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const utils = render(
      <OnboardingStep1Screen navigation={nav as any} route={{} as any} />
    );
    fillRequired(utils);
    fireEvent.press(utils.getByText('Continue'));
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledWith('OnboardingStep2');
    });
  });

  // ── API error ──────────────────────────────────────────────────────────────

  it('shows error message when upsertProfile fails', async () => {
    mockUpsertProfile.mockRejectedValue(new Error('Server error'));
    const nav = makeNavigation();
    const utils = render(
      <OnboardingStep1Screen navigation={nav as any} route={{} as any} />
    );
    fillRequired(utils);
    fireEvent.press(utils.getByText('Continue'));
    await waitFor(() => utils.getByText('Server error'));
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});
