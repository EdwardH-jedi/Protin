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
    brandSoft: '#222',
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
  radii: { sm: 4, md: 8, lg: 12, pill: 9999, full: 9999 },
  spacing: {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48,
  },
  typography: {
    h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Mock NearbyCourtsModal ──────────────────────────────────────────────────
// The modal is unit-tested in its own file; here we stub it so the composer
// tests stay focused on form / submission behavior. The stub exposes a tiny
// "pick a venue" button when `isOpen` so the integration path is testable.

jest.mock('../screens/bookings/NearbyCourtsModal', () => {
  const { Pressable, Text } = require('react-native');
  return {
    NearbyCourtsModal: ({ isOpen, onSelect, onClose }: any) =>
      isOpen
        ? (
          <Pressable
            accessibilityLabel="mock-pick-venue"
            onPress={() => {
              onSelect({
                id: 'venue-1',
                name: 'Tennis Court Alpha',
                sportTags: ['tennis'],
                area: 'Bondi',
                latitude: 0,
                longitude: 0,
                isBookable: false,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
              });
              onClose();
            }}
          >
            <Text>pick mock venue</Text>
          </Pressable>
        )
        : null,
  };
});

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fillRequiredFields(getByPlaceholderText: (s: string) => any) {
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
    // Court / venue field shows a "Find a court" CTA + a freeform fallback.
    expect(getByPlaceholderText('Or type a location, e.g. Bondi gym')).toBeTruthy();
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

  it('calls api.post with the correct payload (freeform location, no venue)', async () => {
    mockApiPost.mockResolvedValue({ id: 'new-booking-id' });
    const navigation = makeNavigation();
    const { getByPlaceholderText, getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={navigation as any} />
    );

    fillRequiredFields(getByPlaceholderText);
    fireEvent.changeText(
      getByPlaceholderText('Or type a location, e.g. Bondi gym'),
      'City Gym'
    );
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
      venueId: undefined,
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

  // ── Venue picker integration ───────────────────────────────────────────────
  // The NearbyCourtsModal is mocked in this file so these tests focus on
  // the composer's state + payload behavior. The modal stub immediately picks
  // a known venue when its "mock-pick-venue" Pressable is fired.

  describe('venue picker', () => {
    it('shows the Find a court CTA when no venue is selected', () => {
      const { getByLabelText } = render(
        <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
      );
      expect(getByLabelText('Choose a court or venue')).toBeTruthy();
    });

    it('selecting a venue replaces the freeform input with a chip', async () => {
      const { getByLabelText, getByText, queryByPlaceholderText } = render(
        <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
      );
      // Open the (mocked) modal, then pick the stub venue.
      fireEvent.press(getByLabelText('Choose a court or venue'));
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      // Freeform input is gone; selected venue chip is visible.
      expect(queryByPlaceholderText('Or type a location, e.g. Bondi gym')).toBeNull();
      expect(getByText('Tennis Court Alpha')).toBeTruthy();
      expect(getByLabelText('Clear selected court')).toBeTruthy();
    });

    it('sends venueId AND a venue-derived location when a venue is picked (Codex Blocker 3)', async () => {
      mockApiPost.mockResolvedValue({ id: 'booking-with-venue' });
      const { getByLabelText, getByPlaceholderText } = render(
        <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
      );
      fillRequiredFields(getByPlaceholderText);
      fireEvent.press(getByLabelText('Choose a court or venue'));
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Send proposal'));
      });
      // The mock venue has area "Bondi" and no address, so the derived
      // string is "<name> — <area>". Persisting this on the booking
      // means the calendar event has a meaningful location field.
      expect(mockApiPost).toHaveBeenCalledWith(
        '/bookings',
        expect.objectContaining({
          venueId: 'venue-1',
          location: 'Tennis Court Alpha — Bondi',
        })
      );
    });

    it('Change clears the selected venue back to the freeform field', async () => {
      const { getByLabelText, getByPlaceholderText, queryByPlaceholderText } = render(
        <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
      );
      fireEvent.press(getByLabelText('Choose a court or venue'));
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      // Now clear the selection.
      fireEvent.press(getByLabelText('Clear selected court'));
      // Freeform input is back.
      expect(getByPlaceholderText('Or type a location, e.g. Bondi gym')).toBeTruthy();
      expect(queryByPlaceholderText).toBeTruthy();
    });
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
