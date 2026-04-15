/**
 * LoginScreen tests
 *
 * Mocks:
 *  - stores/auth (useAuthStore)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { LoginScreen } from '../screens/auth/LoginScreen';

// ─── Mock auth store ──────────────────────────────────────────────────────────

const mockLogin = jest.fn();
const mockLoginWithApple = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: jest.fn(),
}));

// ─── Mock expo-apple-authentication ───────────────────────────────────────────

const mockSignInAsync = jest.fn();

jest.mock('expo-apple-authentication', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 0, WHITE: 1 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <View testID="apple-sign-in-button" accessibilityRole="button" onTouchEnd={onPress} />
    ),
  };
});

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
    loginWithApple: mockLoginWithApple,
    isLoading: overrides.isLoading ?? false,
  });
}

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
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

  // ── Apple Sign-in ──────────────────────────────────────────────────────────

  describe('Apple Sign-in', () => {
    afterEach(() => setPlatform('ios'));

    it('renders the Apple Sign-in button on iOS', () => {
      setPlatform('ios');
      const { queryByTestId } = render(
        <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      expect(queryByTestId('apple-sign-in-button')).not.toBeNull();
    });

    it('does not render the Apple Sign-in button on Android', () => {
      setPlatform('android');
      const { queryByTestId } = render(
        <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      expect(queryByTestId('apple-sign-in-button')).toBeNull();
    });

    it('posts identityToken + nonce to loginWithApple on success', async () => {
      setPlatform('ios');
      mockSignInAsync.mockResolvedValue({
        identityToken: 'apple.jwt.token',
        email: 'user@privaterelay.appleid.com',
        fullName: { givenName: 'Alex', familyName: 'Kim' },
      });
      mockLoginWithApple.mockResolvedValue(undefined);
      const nav = makeNavigation();
      const { getByTestId } = render(
        <LoginScreen navigation={nav as any} route={{} as any} />
      );
      fireEvent(getByTestId('apple-sign-in-button'), 'touchEnd');
      await waitFor(() => expect(mockLoginWithApple).toHaveBeenCalled());
      const payload = mockLoginWithApple.mock.calls[0][0];
      expect(payload.identityToken).toBe('apple.jwt.token');
      expect(typeof payload.nonce).toBe('string');
      expect(payload.nonce.length).toBeGreaterThan(0);
      expect(payload.email).toBe('user@privaterelay.appleid.com');
      expect(payload.name).toBe('Alex Kim');
      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('Main'));
    });

    it('silently ignores user cancellation', async () => {
      setPlatform('ios');
      mockSignInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
      const { getByTestId, queryByText } = render(
        <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      fireEvent(getByTestId('apple-sign-in-button'), 'touchEnd');
      await waitFor(() => expect(mockSignInAsync).toHaveBeenCalled());
      expect(mockLoginWithApple).not.toHaveBeenCalled();
      expect(queryByText(/Apple Sign-in failed/)).toBeNull();
    });
  });
});
