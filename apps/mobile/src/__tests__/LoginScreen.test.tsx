/**
 * LoginScreen tests
 *
 * Mocks:
 *  - stores/auth (useAuthStore)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { LoginScreen } from '../screens/auth/LoginScreen';

// ─── Mock auth store ──────────────────────────────────────────────────────────

const mockLogin = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: jest.fn(),
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
  return { replace: jest.fn(), navigate: jest.fn() };
}

function setupStore(overrides: { isLoading?: boolean } = {}) {
  const { useAuthStore } = require('../stores/auth');
  (useAuthStore as jest.Mock).mockReturnValue({
    login: mockLogin,
    isLoading: overrides.isLoading ?? false,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the title and form labels', () => {
    const { getByText } = render(
      <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Log in');
    getByText('Email');
    getByText('Password');
  });

  it('renders the sign-up footer link', () => {
    const { getByText } = render(
      <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Sign up');
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('shows an error when submitting with empty fields', async () => {
    const { getByText } = render(
      <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByText('Log in'));
    await waitFor(() => getByText('Please enter your email and password.'));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows an error when only email is provided', async () => {
    const { getByText, getByPlaceholderText } = render(
      <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    fireEvent.press(getByText('Log in'));
    await waitFor(() => getByText('Please enter your email and password.'));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator when isLoading is true', () => {
    setupStore({ isLoading: true });
    const { UNSAFE_queryAllByType } = render(
      <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  // ── Successful login ───────────────────────────────────────────────────────

  it('calls login with trimmed email and password', async () => {
    mockLogin.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <LoginScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), '  user@test.com  ');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'secret123');
    fireEvent.press(getByText('Log in'));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@test.com', 'secret123');
    });
  });

  it('navigates to Main after successful login', async () => {
    mockLogin.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <LoginScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'user@test.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'secret123');
    fireEvent.press(getByText('Log in'));
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith('Main');
    });
  });

  // ── Failed login ───────────────────────────────────────────────────────────

  it('shows the error message returned by login', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    const nav = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <LoginScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'user@test.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'wrongpass');
    fireEvent.press(getByText('Log in'));
    await waitFor(() => getByText('Invalid credentials'));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  // ── Footer navigation ──────────────────────────────────────────────────────

  it('navigates to RegisterScreen when Sign up is pressed', () => {
    const nav = makeNavigation();
    const { getByText } = render(
      <LoginScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Sign up'));
    expect(nav.replace).toHaveBeenCalledWith('RegisterScreen');
  });
});
