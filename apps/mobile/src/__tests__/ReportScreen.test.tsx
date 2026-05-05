/**
 * ReportScreen tests
 *
 * Mocks:
 *  - ../lib/api (api.post)
 *  - React Navigation (navigation.goBack)
 *  - ../components/Screen
 *  - ../theme
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { ReportScreen } from '../screens/safety/ReportScreen';

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
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
  spacing: {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48,
  },
  typography: {
    h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation() {
  return { goBack: jest.fn() };
}

function makeRoute(overrides: Record<string, unknown> = {}) {
  return {
    params: {
      reportedUserId: 'user-bad-123',
      reportedName: 'Alex Kim',
      ...overrides,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ReportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('shows the reported user name in the prompt', () => {
    const { getByText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(getByText('Why are you reporting Alex Kim?')).toBeTruthy();
  });

  it('renders all five reason options', () => {
    const { getByText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(getByText('Spam')).toBeTruthy();
    expect(getByText('Inappropriate content')).toBeTruthy();
    expect(getByText('Fake profile')).toBeTruthy();
    expect(getByText('Harassment')).toBeTruthy();
    expect(getByText('Other')).toBeTruthy();
  });

  // ── Submit button guard ────────────────────────────────────────────────────

  it('Submit report button is disabled before a reason is selected', () => {
    const { getByLabelText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    const btn = getByLabelText('Submit report');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('Submit report button is enabled after selecting a reason', () => {
    const { getByLabelText, getByText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    fireEvent.press(getByText('Harassment'));
    const btn = getByLabelText('Submit report');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeFalsy();
  });

  it('does not call api.post when button is disabled', () => {
    const { getByText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    fireEvent.press(getByText('Submit report'));
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  // ── Successful submission ──────────────────────────────────────────────────

  it('calls POST /reports with reason and reportedUserId', async () => {
    mockApiPost.mockResolvedValue({});
    const { getByText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    fireEvent.press(getByText('Spam'));
    await act(async () => {
      fireEvent.press(getByText('Submit report'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/reports', {
      reportedUserId: 'user-bad-123',
      reason: 'spam',
      context: undefined,
    });
  });

  it('includes context in the payload when provided', async () => {
    mockApiPost.mockResolvedValue({});
    const { getByText, getByPlaceholderText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    fireEvent.press(getByText('Harassment'));
    fireEvent.changeText(getByPlaceholderText('Describe what happened…'), 'Sent offensive messages');
    await act(async () => {
      fireEvent.press(getByText('Submit report'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/reports', expect.objectContaining({
      context: 'Sent offensive messages',
    }));
  });

  it('omits context when the field is left empty', async () => {
    mockApiPost.mockResolvedValue({});
    const { getByText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    fireEvent.press(getByText('Fake profile'));
    await act(async () => {
      fireEvent.press(getByText('Submit report'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/reports', expect.objectContaining({
      context: undefined,
    }));
  });

  it('shows the success screen after a successful submission', async () => {
    mockApiPost.mockResolvedValue({});
    const { getByText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    fireEvent.press(getByText('Other'));
    await act(async () => {
      fireEvent.press(getByText('Submit report'));
    });

    await waitFor(() => getByText('Report submitted'));
    expect(
      getByText("Thanks for helping keep SportsGang safe. We'll review this user.")
    ).toBeTruthy();
  });

  it('shows ActivityIndicator while submission is in-flight', async () => {
    let resolve!: (v: unknown) => void;
    mockApiPost.mockReturnValue(new Promise((res) => { resolve = res; }));
    const { getByText, UNSAFE_queryAllByType } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    fireEvent.press(getByText('Spam'));
    act(() => { fireEvent.press(getByText('Submit report')); });

    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);

    await act(async () => { resolve({}); });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('shows an error message when api.post rejects', async () => {
    mockApiPost.mockRejectedValue(new Error('Already reported'));
    const { getByText, findByText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    fireEvent.press(getByText('Spam'));
    await act(async () => {
      fireEvent.press(getByText('Submit report'));
    });

    await findByText('Already reported');
  });

  it('does not show success screen when api.post rejects', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));
    const { getByText, queryByText } = render(
      <ReportScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    fireEvent.press(getByText('Spam'));
    await act(async () => {
      fireEvent.press(getByText('Submit report'));
    });

    expect(queryByText('Report submitted')).toBeNull();
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  it('calls navigation.goBack when Back is pressed', () => {
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <ReportScreen route={makeRoute() as any} navigation={navigation as any} />
    );
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('calls navigation.goBack when Done is pressed on the success screen', async () => {
    mockApiPost.mockResolvedValue({});
    const navigation = makeNavigation();
    const { getByText } = render(
      <ReportScreen route={makeRoute() as any} navigation={navigation as any} />
    );

    fireEvent.press(getByText('Other'));
    await act(async () => {
      fireEvent.press(getByText('Submit report'));
    });

    await waitFor(() => getByText('Done'));
    fireEvent.press(getByText('Done'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
