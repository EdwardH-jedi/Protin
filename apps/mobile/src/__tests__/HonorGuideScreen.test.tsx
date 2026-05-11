/**
 * HonorGuideScreen tests
 *
 * Pins required copy and the truthful-copy guarantees (no popularity
 * leaderboard, no AI moderation, no instant enforcement, no verified
 * identity wording).
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { HonorGuideScreen } from '../screens/help/HonorGuideScreen';

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
  return { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
}

function renderScreen() {
  const navigation = makeNavigation();
  const utils = render(
    <HonorGuideScreen
      navigation={navigation as any}
      route={{ params: undefined, key: 'k', name: 'HonorGuide' } as any}
    />
  );
  return { ...utils, navigation };
}

describe('HonorGuideScreen', () => {
  it('renders the headline trust copy', () => {
    const { getByText } = renderScreen();
    getByText('Build your Honor');
    getByText('Honor is not popularity.');
    getByText('It reflects attendance, fair play, and reliable hosting.');
  });

  it('renders Honor, Gang Score, Sport Levels, and Honor levels sections', () => {
    const { getByLabelText } = renderScreen();
    getByLabelText('Section Honor');
    getByLabelText('Section Gang Score');
    getByLabelText('Section Sport Levels');
    getByLabelText('Section Honor levels');
  });

  it('renders every Honor level pill', () => {
    const { getByText } = renderScreen();
    getByText('Rookie');
    getByText('Regular');
    getByText('Trusted');
    getByText('Captain');
    getByText('Legend');
  });

  it('renders the no-show policy copy', () => {
    const { getByText } = renderScreen();
    getByText('Only join games you can attend.');
    getByText('No-shows can lower Honor.');
    getByText('Excused attendance does not lower Honor.');
  });

  it('renders the reports-and-safety honesty copy', () => {
    const { getByText } = renderScreen();
    getByText("Reports do not automatically change someone's Honor.");
    getByText('Only reviewed actioned reports may affect Honor.');
  });

  it('copy does not include AI moderation / instant enforcement / verified identity / leaderboard', () => {
    const { queryByText } = renderScreen();
    expect(queryByText(/AI moderation/i)).toBeNull();
    expect(queryByText(/instant enforcement/i)).toBeNull();
    expect(queryByText(/verified identity/i)).toBeNull();
    expect(queryByText(/leaderboard/i)).toBeNull();
    expect(queryByText(/popularity leaderboard/i)).toBeNull();
  });

  it('Back button calls navigation.goBack', () => {
    const { getByLabelText, navigation } = renderScreen();
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
