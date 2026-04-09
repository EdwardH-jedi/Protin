/**
 * BookingComposerScreen tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.post)
 *  - React Navigation (navigation.goBack, navigation.replace)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { BookingComposerScreen } from '../screens/bookings/BookingComposerScreen';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiPost = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
  },
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
    h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation() {
  return {
    goBack: jest.fn(),
    replace: jest.fn(),
  };
}

function makeRoute(overrides: Record<string, unknown> = {}) {
  return {
    params: {
      matchId: 'match-abc',
      sport: 'gym',
      ...overrides,
    },
  };
}

/** Fill all required fields with valid values. */
function fillRequiredFields(getByPlaceholderText: (s: string) => ReturnType<typeof getByPlaceholderText>) {
  fireEvent.changeText(getByPlaceholderText('2026-04-15'), '2026-06-01');
  fireEvent.changeText(getByPlaceholderText('09:00'), '09:00');
  fireEvent.changeText(getByPlaceholderText('10:00'), '10:00');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BookingComposerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the header title', () => {
    const { getByText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(getByText('Propose a session')).toBeTruthy();
  });

  it('renders all form field placeholders', () => {
    const { getByPlaceholderText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(getByPlaceholderText('2026-04-15')).toBeTruthy();
    expect(getByPlaceholderText('09:00')).toBeTruthy();
    expect(getByPlaceholderText('10:00')).toBeTruthy();
    expect(getByPlaceholderText('e.g. Bondi gym')).toBeTruthy();
    expect(getByPlaceholderText('Anything your partner should know…')).toBeTruthy();
  });

  // ── canSubmit guard ────────────────────────────────────────────────────────

  it('Send proposal button is disabled when all fields are empty', () => {
    const { getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(true);
  });

  it('Send proposal button is disabled when date is incomplete', () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    fireEvent.changeText(getByPlaceholderText('2026-04-15'), '2026-06'); // only 7 chars
    fireEvent.changeText(getByPlaceholderText('09:00'), '09:00');
    fireEvent.changeText(getByPlaceholderText('10:00'), '10:00');
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(true);
  });

  it('Send proposal button becomes enabled when all required fields are filled', () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    fillRequiredFields(getByPlaceholderText);
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(false);
  });

  // ── Successful submission ──────────────────────────────────────────────────

  it('calls api.post with the correct payload', async () => {
    mockApiPost.mockResolvedValue({ id: 'new-booking-id' });
    const navigation = makeNavigation();
    const { getByPlaceholderText, getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={navigation as any} />
    );

    fillRequiredFields(getByPlaceholderText);
    fireEvent.changeText(getByPlaceholderText('e.g. Bondi gym'), 'City Gym');
    fireEvent.changeText(getByPlaceholderText('Anything your partner should know…'), 'Bring towel');

    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/bookings', {
      matchId: 'match-abc',
      sport: 'gym',
      startsAt: '2026-06-01T09:00:00',
      endsAt: '2026-06-01T10:00:00',
      location: 'City Gym',
      notes: 'Bring towel',
    });
  });

  it('omits location and notes when left empty', async () => {
    mockApiPost.mockResolvedValue({ id: 'new-booking-id' });
    const navigation = makeNavigation();
    const { getByPlaceholderText, getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={navigation as any} />
    );

    fillRequiredFields(getByPlaceholderText);

    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/bookings', expect.objectContaining({
      location: undefined,
      notes: undefined,
    }));
  });

  it('navigates to BookingDetail with the returned booking id on success', async () => {
    mockApiPost.mockResolvedValue({ id: 'new-booking-id' });
    const navigation = makeNavigation();
    const { getByPlaceholderText, getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={navigation as any} />
    );

    fillRequiredFields(getByPlaceholderText);

    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });

    expect(navigation.replace).toHaveBeenCalledWith('BookingDetail', { bookingId: 'new-booking-id' });
  });

  it('shows ActivityIndicator while submitting', async () => {
    let resolve!: (v: unknown) => void;
    mockApiPost.mockReturnValue(new Promise((res) => { resolve = res; }));
    const { getByPlaceholderText, getByLabelText, UNSAFE_queryAllByType } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    fillRequiredFields(getByPlaceholderText);
    act(() => { fireEvent.press(getByLabelText('Send proposal')); });

    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);

    // Clean up — resolve the promise so no state-update warnings
    await act(async () => { resolve({ id: 'x' }); });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('shows an error message when api.post rejects', async () => {
    mockApiPost.mockRejectedValue(new Error('Booking overlap'));
    const { getByPlaceholderText, getByLabelText, findByText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    fillRequiredFields(getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });

    await findByText('Booking overlap');
  });

  it('does not navigate when api.post rejects', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));
    const navigation = makeNavigation();
    const { getByPlaceholderText, getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={navigation as any} />
    );

    fillRequiredFields(getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });

    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('re-enables Send proposal after an error so the user can retry', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));
    const { getByPlaceholderText, getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    fillRequiredFields(getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });

    await waitFor(() => {
      expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(false);
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  it('calls navigation.goBack when the Back button is pressed', () => {
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={navigation as any} />
    );
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  // ── Sport passed through ───────────────────────────────────────────────────

  it('passes the sport from route params to the API call', async () => {
    mockApiPost.mockResolvedValue({ id: 'booking-golf' });
    const navigation = makeNavigation();
    const { getByPlaceholderText, getByLabelText } = render(
      <BookingComposerScreen
        route={makeRoute({ sport: 'golf' }) as any}
        navigation={navigation as any}
      />
    );

    fillRequiredFields(getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/bookings', expect.objectContaining({ sport: 'golf' }));
  });
});
