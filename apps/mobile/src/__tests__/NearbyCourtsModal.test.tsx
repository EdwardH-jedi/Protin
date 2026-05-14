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
});
