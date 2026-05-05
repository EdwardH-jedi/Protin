/**
 * BookingComposerScreen tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.post)
 *  - React Navigation (navigation.goBack, navigation.replace)
 *  - Screen component
 *  - theme
 *  - NearbyCourtsModal (stub that exposes a single "pick venue" Pressable)
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { BookingComposerScreen } from '../screens/bookings/BookingComposerScreen';
import {
  defaultDate,
  defaultStartTime,
  formatDateLabel,
  formatTimeLabel,
  plusOneHour,
} from '../lib/sessionTime';

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

/** Default startsAt the screen sends when the user submits without touching the pickers. */
function expectedStartsAt(): string {
  return `${defaultDate()}T${defaultStartTime()}:00`;
}

/** Default endsAt — start + 1 hour. */
function expectedEndsAt(): string {
  return `${defaultDate()}T${plusOneHour(defaultStartTime())}:00`;
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

  it('renders date + start + end as tappable selectors with friendly defaults', () => {
    const { getByLabelText, getByText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(getByLabelText('Choose date')).toBeTruthy();
    expect(getByLabelText('Choose start time')).toBeTruthy();
    expect(getByLabelText('Choose end time')).toBeTruthy();
    // Friendly default labels: tomorrow + 09:00 → 10:00 in the local locale.
    expect(getByText(formatDateLabel(defaultDate()))).toBeTruthy();
    expect(getByText(formatTimeLabel(defaultStartTime()))).toBeTruthy();
    expect(getByText(formatTimeLabel(plusOneHour(defaultStartTime())))).toBeTruthy();
  });

  it('renders the optional venue + notes inputs', () => {
    const { getByPlaceholderText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(getByPlaceholderText('Or type a location, e.g. Bondi gym')).toBeTruthy();
    expect(getByPlaceholderText('Anything your partner should know…')).toBeTruthy();
  });

  // ── canSubmit / defaults ──────────────────────────────────────────────────

  it('Send proposal is enabled out of the box thanks to valid defaults', () => {
    const { getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(false);
  });

  // ── Successful submission ──────────────────────────────────────────────────

  it('submits the default date + time when nothing is changed (freeform location, no venue)', async () => {
    mockApiPost.mockResolvedValue({ id: 'new-booking-id' });
    const navigation = makeNavigation();
    const { getByLabelText, getByPlaceholderText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={navigation as any} />
    );
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
      startsAt: expectedStartsAt(),
      endsAt: expectedEndsAt(),
      location: 'City Gym',
      venueId: undefined,
      notes: 'Bring towel',
    });
  });

  it('omits location and notes when left empty', async () => {
    mockApiPost.mockResolvedValue({ id: 'new-booking-id' });
    const { getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
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
    const { getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={navigation as any} />
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    expect(navigation.replace).toHaveBeenCalledWith('BookingDetail', { bookingId: 'new-booking-id' });
  });

  it('shows ActivityIndicator while submitting', async () => {
    let resolve!: (v: unknown) => void;
    mockApiPost.mockReturnValue(new Promise((res) => { resolve = res; }));
    const { getByLabelText, UNSAFE_queryAllByType } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    act(() => { fireEvent.press(getByLabelText('Send proposal')); });

    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);

    await act(async () => { resolve({ id: 'x' }); });
  });

  // ── Picker interaction ────────────────────────────────────────────────────

  it('changing start time auto-shifts end time when end would become invalid', async () => {
    mockApiPost.mockResolvedValue({ id: 'b1' });
    const { getByLabelText, getByText, queryByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    // Open the start-time picker and select 23:00.
    fireEvent.press(getByLabelText('Choose start time'));
    fireEvent.press(getByLabelText(`Select ${formatTimeLabel('23:00')}`));

    // The selectors should now reflect 23:00 and end auto-shifted to ≥ 23:30.
    // plusOneHour('23:00') is clamped to '23:45' by sessionTime.
    expect(getByText(formatTimeLabel('23:00'))).toBeTruthy();
    expect(getByText(formatTimeLabel('23:45'))).toBeTruthy();
    expect(queryByLabelText('Choose start time')).toBeTruthy();

    // Submit and confirm the payload reflects the shifted times.
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    expect(mockApiPost).toHaveBeenCalledWith(
      '/bookings',
      expect.objectContaining({
        startsAt: `${defaultDate()}T23:00:00`,
        endsAt: `${defaultDate()}T23:45:00`,
      })
    );
  });

  it('selecting an end time before start time disables Send and shows a friendly inline error', async () => {
    const { getByLabelText, getByText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    // Default start = 09:00, end = 10:00. Move end to 08:00 (before start).
    fireEvent.press(getByLabelText('Choose end time'));
    fireEvent.press(getByLabelText(`Select ${formatTimeLabel('08:00')}`));

    expect(getByText('End time must be later than start time.')).toBeTruthy();
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(true);
  });

  it('rejects an end time that creates a session longer than 4 hours', async () => {
    const { getByLabelText, getByText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    // 09:00 → 14:00 = 5 hours.
    fireEvent.press(getByLabelText('Choose end time'));
    fireEvent.press(getByLabelText(`Select ${formatTimeLabel('14:00')}`));
    expect(getByText('Sessions can be up to 4 hours long.')).toBeTruthy();
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(true);
  });

  it('rejects an end time that creates a session shorter than 30 minutes', async () => {
    const { getByLabelText, getByText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    // 09:00 → 09:15 = 15 minutes.
    fireEvent.press(getByLabelText('Choose end time'));
    fireEvent.press(getByLabelText(`Select ${formatTimeLabel('09:15')}`));
    expect(getByText('Sessions must be at least 30 minutes long.')).toBeTruthy();
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(true);
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('maps a backend "starts_at in the past" error to a friendly message', async () => {
    mockApiPost.mockRejectedValue(new Error('starts_at cannot be more than 1 hour in the past'));
    const { getByLabelText, findByText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    await findByText('Choose a future start time.');
  });

  it('maps a backend overlap error to a friendly message', async () => {
    mockApiPost.mockRejectedValue(new Error('Booking overlap'));
    const { getByLabelText, findByText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    await findByText('You already have a session at this time.');
  });

  it('falls back to a generic friendly message for unknown backend errors', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));
    const { getByLabelText, findByText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    await findByText("Couldn't propose this session. Please try again.");
  });

  it('does not navigate when api.post rejects', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={navigation as any} />
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('re-enables Send proposal after an error so the user can retry', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));
    const { getByLabelText } = render(
      <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
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
      fireEvent.press(getByLabelText('Choose a court or venue'));
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      expect(queryByPlaceholderText('Or type a location, e.g. Bondi gym')).toBeNull();
      expect(getByText('Tennis Court Alpha')).toBeTruthy();
      expect(getByLabelText('Clear selected court')).toBeTruthy();
    });

    it('sends venueId AND a venue-derived location when a venue is picked', async () => {
      mockApiPost.mockResolvedValue({ id: 'booking-with-venue' });
      const { getByLabelText } = render(
        <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
      );
      fireEvent.press(getByLabelText('Choose a court or venue'));
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Send proposal'));
      });
      expect(mockApiPost).toHaveBeenCalledWith(
        '/bookings',
        expect.objectContaining({
          venueId: 'venue-1',
          location: 'Tennis Court Alpha — Bondi',
        })
      );
    });

    it('Change clears the selected venue back to the freeform field', async () => {
      const { getByLabelText, getByPlaceholderText } = render(
        <BookingComposerScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
      );
      fireEvent.press(getByLabelText('Choose a court or venue'));
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      fireEvent.press(getByLabelText('Clear selected court'));
      expect(getByPlaceholderText('Or type a location, e.g. Bondi gym')).toBeTruthy();
    });
  });

  // ── Sport passed through ───────────────────────────────────────────────────

  it('passes the sport from route params to the API call', async () => {
    mockApiPost.mockResolvedValue({ id: 'booking-golf' });
    const { getByLabelText } = render(
      <BookingComposerScreen
        route={makeRoute({ sport: 'golf' }) as any}
        navigation={makeNavigation() as any}
      />
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    expect(mockApiPost).toHaveBeenCalledWith('/bookings', expect.objectContaining({ sport: 'golf' }));
  });
});
