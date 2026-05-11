/**
 * CreateBattleScreen tests
 *
 * Covers: form renders, capacity default updates on sport switch,
 * Create button disabled until title + location, calls createEvent
 * with the right payload, navigates to the resulting detail.
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

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
});
