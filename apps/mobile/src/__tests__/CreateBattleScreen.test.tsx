/**
 * CreateBattleScreen tests
 *
 * Covers: form renders, capacity default updates on sport switch,
 * Create button disabled until title + location, calls createEvent
 * with the right payload, navigates to the resulting detail.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { CreateBattleScreen } from '../screens/battles/CreateBattleScreen';

const mockCreateEvent = jest.fn();

jest.mock('../lib/events', () => {
  const actual = jest.requireActual('../lib/events');
  return {
    ...actual,
    createEvent: (...args: unknown[]) => mockCreateEvent(...args),
  };
});

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// ─── Mock NearbyCourtsModal ──────────────────────────────────────────────────

// Captures the latest props the event form passes into the modal so the
// venue-picker integration tests can assert that sport + coords + status
// flow through correctly. Mirrors the BookingComposerScreen test pattern.
const mockNearbyModalProps = jest.fn();

jest.mock('../screens/bookings/NearbyCourtsModal', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    NearbyCourtsModal: (props: any) => {
      mockNearbyModalProps(props);
      const { isOpen, onSelect, onSelectManual, onClose } = props;
      if (!isOpen) return null;
      return (
        <View>
          <Pressable
            accessibilityLabel="mock-pick-venue"
            onPress={() => {
              onSelect({
                id: 'venue-1',
                name: 'Tennis Court Alpha',
                sportTags: ['tennis'],
                area: 'Bondi',
                address: '1 Beach Rd, Bondi NSW',
                latitude: -33.89,
                longitude: 151.27,
                isBookable: false,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
              });
              onClose();
            }}
          >
            <Text>pick mock venue</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="mock-pick-manual"
            onPress={() => {
              // Simulates the user typing a court name into the
              // modal's bottom fallback and pressing "Use this venue".
              onSelectManual?.('My Backyard Court');
              onClose();
            }}
          >
            <Text>pick mock manual</Text>
          </Pressable>
        </View>
      );
    },
  };
});

// ─── Mock expo-location ───────────────────────────────────────────────────────

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'denied',
    granted: false,
    canAskAgain: false,
    expires: 'never',
  }),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  Accuracy: { Balanced: 3 },
}));

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

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };
}

describe('CreateBattleScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Host a game header and subcopy', () => {
    const { getByText } = render(
      <CreateBattleScreen
        navigation={makeNavigation() as any}
        route={{} as any}
      />
    );
    getByText('Host a game');
    getByText('Set the details. Reliable hosts build higher Honor.');
  });

  it('renders mode and sport options', () => {
    const { getByLabelText } = render(
      <CreateBattleScreen
        navigation={makeNavigation() as any}
        route={{} as any}
      />
    );
    getByLabelText('Select Casual Game');
    getByLabelText('Select Ranked Battle');
    getByLabelText('Select sport Basketball');
    getByLabelText('Select sport Tennis');
  });

  it('Create game button stays disabled until title and location are filled', async () => {
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <CreateBattleScreen navigation={navigation as any} route={{} as any} />
    );
    const cta = getByLabelText('Create game');
    await act(async () => {
      fireEvent.press(cta);
    });
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it('calls createEvent and navigates to BattleDetail on success', async () => {
    mockCreateEvent.mockResolvedValueOnce({ id: 'new-event-1' });
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <CreateBattleScreen navigation={navigation as any} route={{} as any} />
    );

    fireEvent.changeText(getByLabelText('Game title'), 'Friday Hoops');
    fireEvent.changeText(getByLabelText('Game location'), 'Bondi Court');

    await act(async () => {
      fireEvent.press(getByLabelText('Create game'));
    });

    expect(mockCreateEvent).toHaveBeenCalledTimes(1);
    const payload = mockCreateEvent.mock.calls[0][0];
    expect(payload.title).toBe('Friday Hoops');
    expect(payload.locationText).toBe('Bondi Court');
    expect(payload.mode).toBe('casual');
    expect(payload.sport).toBe('basketball');
    expect(payload.visibility).toBe('public');
    expect(payload.capacity).toBeGreaterThan(0);
    expect(navigation.replace).toHaveBeenCalledWith('BattleDetail', {
      eventId: 'new-event-1',
    });
  });

  it('updates capacity default when sport changes (tennis → 2)', async () => {
    const { getByLabelText } = render(
      <CreateBattleScreen
        navigation={makeNavigation() as any}
        route={{} as any}
      />
    );
    fireEvent.press(getByLabelText('Select sport Tennis'));
    const capacityInput = getByLabelText('Game capacity');
    // Default for tennis is 2.
    expect(capacityInput.props.value).toBe('2');
  });

  it('calls navigation.goBack when Back is pressed', () => {
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <CreateBattleScreen navigation={navigation as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  // ── Venue picker integration ────────────────────────────────────────────

  describe('venue picker', () => {
    it('shows the Choose nearby venue button for venue-supported sports (tennis)', () => {
      const { getByLabelText } = render(
        <CreateBattleScreen
          navigation={makeNavigation() as any}
          route={{} as any}
        />
      );
      fireEvent.press(getByLabelText('Select sport Tennis'));
      expect(getByLabelText('Choose nearby venue')).toBeTruthy();
    });

    it('hides the picker for unsupported sports (basketball default) and shows free-text only', () => {
      const { queryByLabelText, getByLabelText } = render(
        <CreateBattleScreen
          navigation={makeNavigation() as any}
          route={{} as any}
        />
      );
      // Basketball is the default first sport in BATTLE_SPORTS, and it
      // sits outside the gym|golf|tennis|running venue catalog.
      expect(queryByLabelText('Choose nearby venue')).toBeNull();
      expect(getByLabelText('Game location')).toBeTruthy();
    });

    it('opens the modal and forwards sport + location status when picker is tapped', async () => {
      const { getByLabelText } = render(
        <CreateBattleScreen
          navigation={makeNavigation() as any}
          route={{} as any}
        />
      );
      fireEvent.press(getByLabelText('Select sport Tennis'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose nearby venue'));
      });
      // Wait for useVenueLocation's denied-path effect to settle.
      await waitFor(() => {
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.isOpen).toBe(true);
        expect(props?.sport).toBe('tennis');
        expect(props?.locationStatus).toBe('denied');
        expect(props?.lat).toBeUndefined();
        expect(props?.lng).toBeUndefined();
      });
    });

    it('selecting a venue populates the form and submit sends a venue-derived locationText', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'event-with-venue' });
      const navigation = makeNavigation();
      const { getByLabelText, getByText, queryByLabelText } = render(
        <CreateBattleScreen navigation={navigation as any} route={{} as any} />
      );
      fireEvent.press(getByLabelText('Select sport Tennis'));
      fireEvent.changeText(getByLabelText('Game title'), 'Annandale Tennis Hit');

      await act(async () => {
        fireEvent.press(getByLabelText('Choose nearby venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });

      // Chip replaces the free-text input.
      expect(getByText('Tennis Court Alpha')).toBeTruthy();
      expect(getByText('1 Beach Rd, Bondi NSW')).toBeTruthy();
      expect(queryByLabelText('Game location')).toBeNull();
      expect(getByLabelText('Clear selected venue')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByLabelText('Create game'));
      });

      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      const payload = mockCreateEvent.mock.calls[0][0];
      expect(payload.sport).toBe('tennis');
      expect(payload.locationText).toBe('Tennis Court Alpha — 1 Beach Rd, Bondi NSW');
    });

    it('Change clears the selected venue back to the free-text fallback', async () => {
      const { getByLabelText, getByPlaceholderText } = render(
        <CreateBattleScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      fireEvent.press(getByLabelText('Select sport Tennis'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose nearby venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      fireEvent.press(getByLabelText('Clear selected venue'));
      expect(getByPlaceholderText('Bondi Beach Court 2')).toBeTruthy();
    });

    it('switching sport away from a venue-supported one drops the selected venue', async () => {
      const { getByLabelText, queryByText } = render(
        <CreateBattleScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      fireEvent.press(getByLabelText('Select sport Tennis'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose nearby venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      expect(queryByText('Tennis Court Alpha')).toBeTruthy();

      fireEvent.press(getByLabelText('Select sport Basketball'));
      // Venue chip is gone; basketball has no picker so free-text returns.
      expect(queryByText('Tennis Court Alpha')).toBeNull();
      expect(getByLabelText('Game location')).toBeTruthy();
    });

    it('still allows submit using only the free-text input on an unsupported sport', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'event-no-picker' });
      const { getByLabelText } = render(
        <CreateBattleScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      // Sport defaults to basketball (no picker available).
      fireEvent.changeText(getByLabelText('Game title'), 'Bondi pickup hoops');
      fireEvent.changeText(getByLabelText('Game location'), 'Bondi Court');
      await act(async () => {
        fireEvent.press(getByLabelText('Create game'));
      });
      const payload = mockCreateEvent.mock.calls[0][0];
      expect(payload.sport).toBe('basketball');
      expect(payload.locationText).toBe('Bondi Court');
    });

    it('forwards enableWiderResults and onSelectManual to the modal', async () => {
      const { getByLabelText } = render(
        <CreateBattleScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      fireEvent.press(getByLabelText('Select sport Tennis'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose nearby venue'));
      });
      await waitFor(() => {
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.enableWiderResults).toBe(true);
        expect(typeof props?.onSelectManual).toBe('function');
      });
    });

    it('manual venue from the modal becomes the locationText on submit', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'event-manual-venue' });
      const navigation = makeNavigation();
      const { getByLabelText, queryByText } = render(
        <CreateBattleScreen navigation={navigation as any} route={{} as any} />
      );
      fireEvent.press(getByLabelText('Select sport Tennis'));
      fireEvent.changeText(getByLabelText('Game title'), 'Tennis at the back court');

      await act(async () => {
        fireEvent.press(getByLabelText('Choose nearby venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-manual'));
      });

      // No structured selection chip — the typed-text path is in play.
      expect(queryByText('Tennis Court Alpha')).toBeNull();
      // Outer free-text mirrors what the user typed in the modal.
      const locationInput = getByLabelText('Game location');
      expect(locationInput.props.value).toBe('My Backyard Court');

      await act(async () => {
        fireEvent.press(getByLabelText('Create game'));
      });

      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      const payload = mockCreateEvent.mock.calls[0][0];
      // Existing backend-compatible field: locationText.
      expect(payload.locationText).toBe('My Backyard Court');
      expect(payload.sport).toBe('tennis');
    });

    it('manual venue overrides a previously selected structured venue', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'event-manual-overrides' });
      const { getByLabelText, queryByText } = render(
        <CreateBattleScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      fireEvent.press(getByLabelText('Select sport Tennis'));
      fireEvent.changeText(getByLabelText('Game title'), 'Tennis hit');

      // First: pick a structured venue.
      await act(async () => {
        fireEvent.press(getByLabelText('Choose nearby venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      // Then: reopen and use manual fallback — modal closes, chip
      // disappears, free-text input returns with the typed value.
      await act(async () => {
        fireEvent.press(getByLabelText('Clear selected venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Choose nearby venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-manual'));
      });
      expect(queryByText('Tennis Court Alpha')).toBeNull();

      await act(async () => {
        fireEvent.press(getByLabelText('Create game'));
      });
      const payload = mockCreateEvent.mock.calls[0][0];
      expect(payload.locationText).toBe('My Backyard Court');
    });
  });
});
