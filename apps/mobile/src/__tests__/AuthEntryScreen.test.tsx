/**
 * AuthEntryScreen tests
 *
 * Mocks:
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { AuthEntryScreen } from '../screens/auth/AuthEntryScreen';

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthEntryScreen', () => {
  it('renders the headline copy', () => {
    const { getByText } = render(
      <AuthEntryScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Find your');
    getByText('sports partner.');
  });

  it('renders the sport / city eyebrow', () => {
    const { getByText } = render(
      <AuthEntryScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Sydney · Find sports partners');
  });

  it('renders Get started and Log in buttons', () => {
    const { getByText } = render(
      <AuthEntryScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Get started');
    getByText('Log in');
  });

  it('navigates to RegisterScreen when Get started is pressed', () => {
    const nav = makeNavigation();
    const { getByText } = render(
      <AuthEntryScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Get started'));
    expect(nav.navigate).toHaveBeenCalledWith('RegisterScreen');
  });

  it('navigates to LoginScreen when Log in is pressed', () => {
    const nav = makeNavigation();
    const { getByText } = render(
      <AuthEntryScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Log in'));
    expect(nav.navigate).toHaveBeenCalledWith('LoginScreen');
  });
});
