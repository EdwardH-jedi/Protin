/**
 * NearbyCourtsModal tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.get) — drives the venue list
 *  - theme — keep token surface tiny
 *  - react-native Linking — assert booking-url presses
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { NearbyCourtsModal } from '../screens/bookings/NearbyCourtsModal';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

// ─── Mock react-native-maps ───────────────────────────────────────────────────
//
// Native rendering can't run under Jest. The mock replaces MapView with a
// plain View that simply renders its children so Marker stubs are still
// discoverable, and exposes each Marker as a Pressable keyed off the
// venue id so tests can drive `onPress` directly.

jest.mock('react-native-maps', () => {
  const { View, Pressable, Text } = require('react-native');
  const MapView = ({ children, ...rest }: any) => (
    <View accessibilityLabel="mock-map-view" {...rest}>
      {children}
    </View>
  );
  const Marker = ({
    identifier,
    title,
    onPress,
    accessibilityLabel,
  }: any) => (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? `mock-marker-${identifier ?? title}`}
      onPress={onPress}
    >
      <Text>{title}</Text>
    </Pressable>
  );
  return {
    __esModule: true,
    default: MapView,
    Marker,
    PROVIDER_DEFAULT: 'default',
  };
});

// ─── Mock theme ───────────────────────────────────────────────────────────────

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#000', brandSoft: '#222', border: '#ccc',
    surface: '#fff', surfaceElevated: '#f5f5f5', background: '#fafafa',
    separator: '#e0e0e0', textPrimary: '#000', textSecondary: '#555',
    textTertiary: '#888', textInverse: '#fff', success: '#0f0', error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, pill: 9999, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: {
    h1: {}, h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function venue(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'venue-tennis-1',
    name: 'Tennis Court Alpha',
    sportTags: ['tennis'],
    area: 'Bondi',
    address: '1 Beach Rd, Bondi NSW',
    latitude: -33.89,
    longitude: 151.27,
    bookingUrl: undefined,
    notes: undefined,
    isBookable: false,
    distanceKm: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NearbyCourtsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not fetch venues while closed', () => {
    render(
      <NearbyCourtsModal
        isOpen={false}
        sport="tennis"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('fetches /venues/nearby with the sport when opened', async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0 });
    render(
      <NearbyCourtsModal
        isOpen
        sport="tennis"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/venues/nearby?sport=tennis');
    });
  });

  it('passes lat/lng query params when both are provided', async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0 });
    render(
      <NearbyCourtsModal
        isOpen
        sport="running"
        lat={-33.89}
        lng={151.27}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        '/venues/nearby?sport=running&lat=-33.89&lng=151.27'
      );
    });
  });

  it('renders venue cards from the response', async () => {
    mockApiGet.mockResolvedValue({
      items: [
        venue({ id: 'v1', name: 'Bondi Court', area: 'Bondi' }),
        venue({ id: 'v2', name: 'Newtown Court', area: 'Newtown' }),
      ],
      total: 2,
    });
    const { findByText } = render(
      <NearbyCourtsModal isOpen sport="tennis" onSelect={jest.fn()} onClose={jest.fn()} />
    );
    await findByText('Bondi Court');
    await findByText('Newtown Court');
  });

  it('renders distance label when distanceKm is supplied', async () => {
    mockApiGet.mockResolvedValue({
      items: [venue({ name: 'Far Court', distanceKm: 4.6 })],
      total: 1,
    });
    const { findByText } = render(
      <NearbyCourtsModal isOpen sport="tennis" onSelect={jest.fn()} onClose={jest.fn()} />
    );
    await findByText('4.6 km');
  });

  it('renders metres for sub-kilometre distances', async () => {
    mockApiGet.mockResolvedValue({
      items: [venue({ name: 'Right Here', distanceKm: 0.4 })],
      total: 1,
    });
    const { findByText } = render(
      <NearbyCourtsModal isOpen sport="tennis" onSelect={jest.fn()} onClose={jest.fn()} />
    );
    await findByText('400 m');
  });

  it('Use for session triggers onSelect and onClose with the venue', async () => {
    const v = venue({ id: 'v-pick', name: 'Pickable Court' });
    mockApiGet.mockResolvedValue({ items: [v], total: 1 });
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const { findByLabelText } = render(
      <NearbyCourtsModal isOpen sport="tennis" onSelect={onSelect} onClose={onClose} />
    );
    const useBtn = await findByLabelText('Use Pickable Court for session');
    await act(async () => {
      fireEvent.press(useBtn);
    });
    expect(onSelect).toHaveBeenCalledWith(v);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the empty state when the response is empty', async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0 });
    const { findByText } = render(
      <NearbyCourtsModal isOpen sport="tennis" onSelect={jest.fn()} onClose={jest.fn()} />
    );
    await findByText('No courts found');
  });

  it('shows an error and retry button when fetch rejects', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Network down'));
    const { findByText, findByLabelText } = render(
      <NearbyCourtsModal isOpen sport="tennis" onSelect={jest.fn()} onClose={jest.fn()} />
    );
    await findByText('Network down');
    await findByLabelText('Retry loading courts');
  });

  it('does not show "Open booking" link when isBookable is false', async () => {
    mockApiGet.mockResolvedValue({
      items: [
        venue({
          name: 'Free Public Court',
          bookingUrl: 'https://example.com/should-not-show',
          isBookable: false,
        }),
      ],
      total: 1,
    });
    const { findByText, queryByLabelText } = render(
      <NearbyCourtsModal isOpen sport="tennis" onSelect={jest.fn()} onClose={jest.fn()} />
    );
    await findByText('Free Public Court');
    expect(queryByLabelText('Open booking for Free Public Court')).toBeNull();
  });

  it('opens bookingUrl when "Open booking" is pressed on a bookable venue', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockApiGet.mockResolvedValue({
      items: [
        venue({
          name: 'Real Bookable Court',
          bookingUrl: 'https://example.com/book',
          isBookable: true,
        }),
      ],
      total: 1,
    });
    const { findByLabelText } = render(
      <NearbyCourtsModal isOpen sport="tennis" onSelect={jest.fn()} onClose={jest.fn()} />
    );
    const openBtn = await findByLabelText('Open booking for Real Bookable Court');
    fireEvent.press(openBtn);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/book');
    openSpy.mockRestore();
  });

  it('Close button calls onClose', async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0 });
    const onClose = jest.fn();
    const { findByText, getByLabelText } = render(
      <NearbyCourtsModal isOpen sport="tennis" onSelect={jest.fn()} onClose={onClose} />
    );
    // Wait for the initial fetch to settle so the trailing setState
    // doesn't fire after this test completes (act() warning).
    await findByText('No courts found');
    fireEvent.press(getByLabelText('Close courts and venues'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not claim "nearby" sort when no coordinates are passed', async () => {
    // Catalog-honest wording: without coords the modal must not call the
    // results nearby. "Sorted near you" / "nearest" are reserved for the
    // distance-sorted path.
    mockApiGet.mockResolvedValue({ items: [], total: 0 });
    const { findByText, queryByText } = render(
      <NearbyCourtsModal isOpen sport="tennis" onSelect={jest.fn()} onClose={jest.fn()} />
    );
    await findByText('Courts & venues');
    expect(queryByText('Sorted near you')).toBeNull();
    expect(queryByText(/nearest/i)).toBeNull();
  });

  it('shows "Sorted near you" when coordinates are provided', async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0 });
    const { findByText } = render(
      <NearbyCourtsModal
        isOpen
        sport="tennis"
        lat={-33.89}
        lng={151.27}
        locationStatus="granted"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    await findByText('Sorted near you');
  });

  it('shows "Location off" fallback when permission is denied', async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0 });
    const { findByText } = render(
      <NearbyCourtsModal
        isOpen
        sport="tennis"
        locationStatus="denied"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    await findByText('Location off. Showing Sydney catalog.');
  });

  it('shows "Location off" fallback when location is unavailable', async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0 });
    const { findByText } = render(
      <NearbyCourtsModal
        isOpen
        sport="tennis"
        locationStatus="unavailable"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    await findByText('Location off. Showing Sydney catalog.');
  });

  it('still renders the catalog when location is denied (does not block the modal)', async () => {
    mockApiGet.mockResolvedValue({
      items: [venue({ name: 'Catalog Court' })],
      total: 1,
    });
    const { findByText } = render(
      <NearbyCourtsModal
        isOpen
        sport="tennis"
        locationStatus="denied"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    await findByText('Catalog Court');
  });

  // ── Map mode ────────────────────────────────────────────────────────────

  describe('list / map toggle', () => {
    it('renders the List/Map toggle and defaults to List mode', async () => {
      mockApiGet.mockResolvedValue({
        items: [venue({ name: 'Default-Mode Court' })],
        total: 1,
      });
      const { findByText, getByLabelText, queryByLabelText } = render(
        <NearbyCourtsModal isOpen sport="tennis" onSelect={jest.fn()} onClose={jest.fn()} />
      );
      // List/Map chips render.
      expect(getByLabelText('Show venue list')).toBeTruthy();
      expect(getByLabelText('Show venue map')).toBeTruthy();
      // List mode is active by default — VenueCard is on screen, map is not.
      await findByText('Default-Mode Court');
      expect(queryByLabelText('Venue map')).toBeNull();
    });

    it('switching to Map mode renders the map and venue pins', async () => {
      mockApiGet.mockResolvedValue({
        items: [
          venue({ id: 'v-a', name: 'Pin A' }),
          venue({ id: 'v-b', name: 'Pin B', latitude: -33.88, longitude: 151.25 }),
        ],
        total: 2,
      });
      const { findByText, getByLabelText, queryByText } = render(
        <NearbyCourtsModal
          isOpen
          sport="tennis"
          lat={-33.89}
          lng={151.27}
          locationStatus="granted"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      );
      // Wait for venues to load (List renders by default).
      await findByText('Pin A');
      // Flip to Map.
      await act(async () => {
        fireEvent.press(getByLabelText('Show venue map'));
      });
      // Map container is present; VenueCard chrome from List is gone.
      expect(getByLabelText('Venue map')).toBeTruthy();
      // Both pin titles render via the Marker mock.
      expect(getByLabelText('Venue pin Pin A')).toBeTruthy();
      expect(getByLabelText('Venue pin Pin B')).toBeTruthy();
      // Pre-selection: hint copy, no preview chip.
      expect(queryByText(/Tap a pin to select/i)).toBeTruthy();
    });

    it('shows the no-coords map hint when location is denied (still safe to render)', async () => {
      mockApiGet.mockResolvedValue({
        items: [venue({ name: 'Catalog Pin' })],
        total: 1,
      });
      const { findByText, getByLabelText } = render(
        <NearbyCourtsModal
          isOpen
          sport="tennis"
          locationStatus="denied"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      );
      await findByText('Catalog Pin');
      await act(async () => {
        fireEvent.press(getByLabelText('Show venue map'));
      });
      expect(getByLabelText('Venue map')).toBeTruthy();
      // Catalog-honest fallback copy: must not pretend results are "nearby".
      const hint = await findByText(
        /turn on location for distance sort/i
      );
      expect(hint).toBeTruthy();
    });

    it('tapping a pin reveals the selection preview with the venue name', async () => {
      mockApiGet.mockResolvedValue({
        items: [venue({ id: 'v-tap', name: 'Tappable Court', area: 'Glebe' })],
        total: 1,
      });
      const { findByText, getByLabelText } = render(
        <NearbyCourtsModal
          isOpen
          sport="tennis"
          lat={-33.89}
          lng={151.27}
          locationStatus="granted"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      );
      await findByText('Tappable Court');
      await act(async () => {
        fireEvent.press(getByLabelText('Show venue map'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Venue pin Tappable Court'));
      });
      // Preview card replaces the hint and exposes the "select" button.
      expect(getByLabelText('Selected venue preview')).toBeTruthy();
      expect(
        getByLabelText('Select Tappable Court for session')
      ).toBeTruthy();
    });

    it('"Select this venue" from Map mode fires the parent onSelect + onClose', async () => {
      mockApiGet.mockResolvedValue({
        items: [venue({ id: 'v-pick', name: 'Pickable From Map' })],
        total: 1,
      });
      const onSelect = jest.fn();
      const onClose = jest.fn();
      const { findByText, getByLabelText } = render(
        <NearbyCourtsModal
          isOpen
          sport="tennis"
          lat={-33.89}
          lng={151.27}
          locationStatus="granted"
          onSelect={onSelect}
          onClose={onClose}
        />
      );
      await findByText('Pickable From Map');
      await act(async () => {
        fireEvent.press(getByLabelText('Show venue map'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Venue pin Pickable From Map'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Select Pickable From Map for session'));
      });
      expect(onSelect).toHaveBeenCalledTimes(1);
      const selectedVenue = onSelect.mock.calls[0][0];
      expect(selectedVenue.id).toBe('v-pick');
      expect(selectedVenue.name).toBe('Pickable From Map');
      expect(onClose).toHaveBeenCalled();
    });

    it('switching back to List preserves the existing card UX', async () => {
      mockApiGet.mockResolvedValue({
        items: [venue({ name: 'Round-Trip Court' })],
        total: 1,
      });
      const { findByText, getByLabelText, queryByLabelText } = render(
        <NearbyCourtsModal
          isOpen
          sport="tennis"
          lat={-33.89}
          lng={151.27}
          locationStatus="granted"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      );
      await findByText('Round-Trip Court');
      await act(async () => {
        fireEvent.press(getByLabelText('Show venue map'));
      });
      expect(getByLabelText('Venue map')).toBeTruthy();
      await act(async () => {
        fireEvent.press(getByLabelText('Show venue list'));
      });
      // The card "Use for session" button label proves List mode is back.
      expect(getByLabelText('Use Round-Trip Court for session')).toBeTruthy();
      expect(queryByLabelText('Venue map')).toBeNull();
    });

    // ── Stale-selection regressions (Codex APPROVE-WITH-FIXES) ──────────

    it('clears stale map selection on close / reopen boundary', async () => {
      mockApiGet.mockResolvedValue({
        items: [venue({ id: 'v-stale', name: 'Stale Pin Court' })],
        total: 1,
      });
      const onClose = jest.fn();
      const { findByText, getByLabelText, queryByLabelText, rerender } = render(
        <NearbyCourtsModal
          isOpen
          sport="tennis"
          lat={-33.89}
          lng={151.27}
          locationStatus="granted"
          onSelect={jest.fn()}
          onClose={onClose}
        />
      );
      await findByText('Stale Pin Court');
      await act(async () => {
        fireEvent.press(getByLabelText('Show venue map'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Venue pin Stale Pin Court'));
      });
      // Preview present pre-close.
      expect(getByLabelText('Selected venue preview')).toBeTruthy();

      // Close the modal — same render, isOpen=false.
      await act(async () => {
        rerender(
          <NearbyCourtsModal
            isOpen={false}
            sport="tennis"
            lat={-33.89}
            lng={151.27}
            locationStatus="granted"
            onSelect={jest.fn()}
            onClose={onClose}
          />
        );
      });
      // Reopen.
      await act(async () => {
        rerender(
          <NearbyCourtsModal
            isOpen
            sport="tennis"
            lat={-33.89}
            lng={151.27}
            locationStatus="granted"
            onSelect={jest.fn()}
            onClose={onClose}
          />
        );
      });
      await findByText('Stale Pin Court');
      await act(async () => {
        fireEvent.press(getByLabelText('Show venue map'));
      });
      // Stale preview must not be on screen — the select-button for the
      // previously-tapped venue is the most telling signal.
      expect(
        queryByLabelText('Select Stale Pin Court for session')
      ).toBeNull();
      expect(queryByLabelText('Selected venue preview')).toBeNull();
    });

    it('clears stale map selection when sport changes mid-session', async () => {
      // First sport: tennis with a tennis venue.
      mockApiGet.mockResolvedValueOnce({
        items: [venue({ id: 'v-tennis', name: 'Tennis Stale' })],
        total: 1,
      });
      const { findByText, getByLabelText, queryByLabelText, rerender } = render(
        <NearbyCourtsModal
          isOpen
          sport="tennis"
          lat={-33.89}
          lng={151.27}
          locationStatus="granted"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      );
      await findByText('Tennis Stale');
      await act(async () => {
        fireEvent.press(getByLabelText('Show venue map'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Venue pin Tennis Stale'));
      });
      expect(getByLabelText('Select Tennis Stale for session')).toBeTruthy();

      // Sport switches → the hook re-fetches and the modal must drop
      // the stale selection regardless of the new result set.
      mockApiGet.mockResolvedValueOnce({
        items: [venue({ id: 'v-running', name: 'Running Loop' })],
        total: 1,
      });
      await act(async () => {
        rerender(
          <NearbyCourtsModal
            isOpen
            sport="running"
            lat={-33.89}
            lng={151.27}
            locationStatus="granted"
            onSelect={jest.fn()}
            onClose={jest.fn()}
          />
        );
      });
      await findByText('Running Loop');
      // Stale tennis preview must be gone — no "Tennis Stale" button.
      expect(queryByLabelText('Select Tennis Stale for session')).toBeNull();
      expect(queryByLabelText('Selected venue preview')).toBeNull();
    });

    it('clears stale map selection when the selected venue drops out of the result set', async () => {
      // First fetch: include the venue the user will tap.
      mockApiGet.mockResolvedValueOnce({
        items: [
          venue({ id: 'v-keep', name: 'Keep This Court' }),
          venue({ id: 'v-drop', name: 'Will Disappear' }),
        ],
        total: 2,
      });
      const { findByText, getByLabelText, queryByLabelText, rerender } = render(
        <NearbyCourtsModal
          isOpen
          sport="tennis"
          lat={-33.89}
          lng={151.27}
          locationStatus="granted"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      );
      await findByText('Will Disappear');
      await act(async () => {
        fireEvent.press(getByLabelText('Show venue map'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Venue pin Will Disappear'));
      });
      expect(getByLabelText('Select Will Disappear for session')).toBeTruthy();

      // Force a refetch *without* crossing the isOpen / sport boundary
      // by nudging the user's coordinates. The hook keys on lat/lng,
      // so this triggers a fresh fetch into the same modal session —
      // and the venues-changed effect must drop the now-absent pin.
      mockApiGet.mockResolvedValueOnce({
        items: [venue({ id: 'v-keep', name: 'Keep This Court' })],
        total: 1,
      });
      await act(async () => {
        rerender(
          <NearbyCourtsModal
            isOpen
            sport="tennis"
            lat={-33.8}
            lng={151.2}
            locationStatus="granted"
            onSelect={jest.fn()}
            onClose={jest.fn()}
          />
        );
      });
      await findByText('Keep This Court');
      // Marker for the dropped venue is gone, and the stale preview
      // chip for it must NOT be on screen.
      expect(queryByLabelText('Venue pin Will Disappear')).toBeNull();
      expect(queryByLabelText('Select Will Disappear for session')).toBeNull();
      expect(queryByLabelText('Selected venue preview')).toBeNull();
    });
  });
});
