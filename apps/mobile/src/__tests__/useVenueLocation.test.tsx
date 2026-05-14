/**
 * useVenueLocation tests
 *
 * Mocks:
 *  - expo-location — drives the permission + position resolve flow
 *
 * Renders a tiny harness so we can read the hook return through the
 * RNTL render tree (no separate renderHook dependency).
 */

import React from 'react';
import { Text, View } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

import { useVenueLocation } from '../hooks/useVenueLocation';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  Accuracy: { Balanced: 3 },
}));

const Location = require('expo-location') as {
  getForegroundPermissionsAsync: jest.Mock;
  requestForegroundPermissionsAsync: jest.Mock;
  getCurrentPositionAsync: jest.Mock;
};

function Harness({ enabled }: { enabled: boolean }) {
  const r = useVenueLocation({ enabled });
  return (
    <View>
      <Text testID="status">{r.status}</Text>
      <Text testID="lat">{r.latitude === undefined ? '-' : String(r.latitude)}</Text>
      <Text testID="lng">{r.longitude === undefined ? '-' : String(r.longitude)}</Text>
      <Text testID="error">{r.error ?? '-'}</Text>
    </View>
  );
}

describe('useVenueLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays idle while disabled and never prompts', () => {
    const { getByTestId } = render(<Harness enabled={false} />);
    expect(getByTestId('status').props.children).toBe('idle');
    expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns granted + coords when permission is already granted', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: -33.5, longitude: 151.1, altitude: 0, accuracy: 5, heading: 0, speed: 0 },
      timestamp: 1,
    });
    const { getByTestId } = render(<Harness enabled />);
    await waitFor(() => {
      expect(getByTestId('status').props.children).toBe('granted');
    });
    expect(getByTestId('lat').props.children).toBe('-33.5');
    expect(getByTestId('lng').props.children).toBe('151.1');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts when status is undetermined and reports granted on accept', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
      granted: false,
      canAskAgain: true,
      expires: 'never',
    });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 1, longitude: 2, altitude: 0, accuracy: 5, heading: 0, speed: 0 },
      timestamp: 1,
    });
    const { getByTestId } = render(<Harness enabled />);
    await waitFor(() => {
      expect(getByTestId('status').props.children).toBe('granted');
    });
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('never re-prompts when permission is hard-denied (canAskAgain=false)', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });
    const { getByTestId } = render(<Harness enabled />);
    await waitFor(() => {
      expect(getByTestId('status').props.children).toBe('denied');
    });
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports unavailable when getCurrentPositionAsync throws', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    Location.getCurrentPositionAsync.mockRejectedValue(new Error('GPS off'));
    const { getByTestId } = render(<Harness enabled />);
    await waitFor(() => {
      expect(getByTestId('status').props.children).toBe('unavailable');
    });
    expect(getByTestId('error').props.children).toBe('GPS off');
  });

  it('does not re-prompt on a second enable cycle once resolved', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 1, longitude: 2, altitude: 0, accuracy: 5, heading: 0, speed: 0 },
      timestamp: 1,
    });
    const { rerender, getByTestId } = render(<Harness enabled />);
    await waitFor(() => {
      expect(getByTestId('status').props.children).toBe('granted');
    });
    await act(async () => {
      rerender(<Harness enabled={false} />);
    });
    await act(async () => {
      rerender(<Harness enabled />);
    });
    // Resolved-state guard prevents a second call into the OS APIs.
    expect(Location.getForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });
});
