/**
 * ChatScreen tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.get / api.post)
 *  - apps/mobile/src/stores/auth (useAuthStore)
 *  - React Navigation (navigation.goBack, navigation.navigate)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { ChatScreen } from '../screens/chat/ChatScreen';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
  BASE_URL: 'http://localhost:8000',
}));

// ─── Mock auth store ──────────────────────────────────────────────────────────

jest.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'me-123', email: 'me@example.com' },
    token: 'test-jwt-token',
  }),
}));

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

interface MockWS {
  url: string;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close: jest.Mock;
}

let mockWsInstances: MockWS[] = [];

class MockWebSocket implements MockWS {
  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1; // OPEN
  close = jest.fn(() => { this.readyState = 3; });

  constructor(url: string) {
    this.url = url;
    mockWsInstances.push(this);
  }
}

// Inject before module load so the import in ChatScreen picks it up.
(global as unknown as Record<string, unknown>).WebSocket = MockWebSocket;

// ─── Mock Screen component ────────────────────────────────────────────────────

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// ─── Mock react-native-safe-area-context ──────────────────────────────────────
// ChatScreen now reads insets.bottom directly to pad the composer above the
// home indicator. The default SafeAreaProvider is not in this test tree, so
// we stub the hook to a zero-inset record (matches the simulator's behavior
// on devices without a home indicator).

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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
    h2: {}, h3: {}, body: {}, bodySmall: {}, label: {}, button: {},
  },
}));

// ─── Mock navigation types (no-op — navigation is injected as a prop) ─────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation(overrides: Record<string, jest.Mock> = {}) {
  return {
    goBack: jest.fn(),
    navigate: jest.fn(),
    ...overrides,
  };
}

function makeRoute(overrides: Record<string, unknown> = {}) {
  return {
    params: {
      matchId: 'match-1',
      partnerName: 'Jordan Lee',
      partnerId: 'partner-456',
      sport: 'gym',
      ...overrides,
    },
  };
}

const emptyMessageResponse = { items: [], total: 0, limit: 100, offset: 0 };

const sampleMessages = [
  {
    id: 'msg-1',
    matchId: 'match-1',
    senderId: 'partner-456',
    body: 'Hey! Want to train tomorrow?',
    createdAt: '2026-04-08T08:00:00Z',
  },
  {
    id: 'msg-2',
    matchId: 'match-1',
    senderId: 'me-123',
    body: 'Absolutely, sounds great!',
    createdAt: '2026-04-08T08:01:00Z',
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWsInstances = [];
  });

  // ── Loading & fetch ────────────────────────────────────────────────────────

  it('shows a loading indicator on mount before messages load', () => {
    // Never resolves during this test
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { UNSAFE_queryAllByType } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  it('renders partner name in the header', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => getByText('Jordan Lee'));
  });

  it('fetches messages from the correct endpoint', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/matches/match-1/messages?limit=100');
    });
  });

  // ── Empty messages ─────────────────────────────────────────────────────────

  it('shows the empty state prompt when there are no messages', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => {
      getByText('Say hello to Jordan Lee to get things started.');
    });
  });

  // ── Message rendering ──────────────────────────────────────────────────────

  it('renders messages returned by the API', async () => {
    mockApiGet.mockResolvedValue({ items: sampleMessages, total: 2, limit: 100, offset: 0 });
    const { getByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => {
      getByText('Hey! Want to train tomorrow?');
      getByText('Absolutely, sounds great!');
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error message and a retry button when fetch fails', async () => {
    mockApiGet.mockRejectedValue(new Error('Connection refused'));
    const { getByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => {
      getByText('Connection refused');
      getByText('Try again');
    });
  });

  it('retries fetching messages when Try again is pressed', async () => {
    mockApiGet
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValue(emptyMessageResponse);

    const { getByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => getByText('Try again'));
    await act(async () => {
      fireEvent.press(getByText('Try again'));
    });
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  // ── Send message ───────────────────────────────────────────────────────────

  it('sends a message and appends it to the list', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const sentMsg = {
      id: 'msg-new',
      matchId: 'match-1',
      senderId: 'me-123',
      body: 'Hello!',
      createdAt: '2026-04-08T09:00:00Z',
    };
    mockApiPost.mockResolvedValue(sentMsg);

    const { getByPlaceholderText, getByLabelText, findByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    await waitFor(() => getByPlaceholderText('Message…'));

    fireEvent.changeText(getByPlaceholderText('Message…'), 'Hello!');
    await act(async () => {
      fireEvent.press(getByLabelText('Send'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/matches/match-1/messages', { body: 'Hello!' });
    await findByText('Hello!');
  });

  it('clears the input after sending', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    mockApiPost.mockResolvedValue({
      id: 'msg-x', matchId: 'match-1', senderId: 'me-123', body: 'Hi', createdAt: '2026-04-08T09:00:00Z',
    });

    const { getByPlaceholderText, getByLabelText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    await waitFor(() => getByPlaceholderText('Message…'));
    fireEvent.changeText(getByPlaceholderText('Message…'), 'Hi');
    await act(async () => {
      fireEvent.press(getByLabelText('Send'));
    });

    await waitFor(() => {
      expect(getByPlaceholderText('Message…').props.value).toBe('');
    });
  });

  it('restores the draft and shows an Alert when send fails', async () => {
    // Real-device hardening: a network blip on /matches/.../messages must not
    // silently swallow the user's typed text. The current behavior optimistically
    // clears the draft for responsiveness, so the catch path must put it back.
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    mockApiPost.mockRejectedValue(new Error('Network down'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByPlaceholderText, getByLabelText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    await waitFor(() => getByPlaceholderText('Message…'));
    fireEvent.changeText(getByPlaceholderText('Message…'), 'Will retry this');
    await act(async () => {
      fireEvent.press(getByLabelText('Send'));
    });

    // Draft restored to the user's typed text.
    expect(getByPlaceholderText('Message…').props.value).toBe('Will retry this');
    // Failure surfaced.
    expect(alertSpy).toHaveBeenCalledWith('Could not send', 'Network down');
    alertSpy.mockRestore();
  });

  it('preserves a WebSocket-received message that arrived during the initial fetch', async () => {
    // Race: chat opens → fetchMessages GET starts → WS opens and partner sends
    // a message that lands in state via ws.onmessage → fetch finally resolves
    // with a list that does NOT yet include that message. Before this
    // hardening, fetchMessages did setMessages(data.items) which overwrote
    // the WS-received message. Now it merges, so the message survives.
    let resolveFetch!: (v: typeof emptyMessageResponse) => void;
    mockApiGet.mockReturnValue(
      new Promise((res) => {
        resolveFetch = res;
      })
    );
    const { findByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    // WS opens and a frame arrives BEFORE the fetch resolves. The list is
    // still hidden behind the loading spinner at this point.
    await waitFor(() => expect(mockWsInstances.length).toBe(1));
    const wsOnly = {
      id: 'ws-arrived-mid-fetch',
      matchId: 'match-1',
      senderId: 'partner-456',
      body: 'Arrived mid-fetch',
      createdAt: '2026-04-08T08:30:00Z',
    };
    act(() => {
      mockWsInstances[0].onmessage?.({ data: JSON.stringify(wsOnly) });
    });

    // Now the original fetch resolves with an empty list (server hadn't
    // persisted the WS message at the time of the GET — the realistic race).
    await act(async () => {
      resolveFetch(emptyMessageResponse);
    });

    // After loading flips off, the FlatList renders and the WS-received
    // message must still be visible — merge, not replace.
    await findByText('Arrived mid-fetch');
  });

  it('does not call api.post when the draft is empty', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByLabelText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => getByLabelText('Send'));
    fireEvent.press(getByLabelText('Send'));
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  it('calls navigation.goBack when the Back button is pressed', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <ChatScreen route={makeRoute() as any} navigation={navigation as any} />
    );
    await waitFor(() => getByLabelText('Back'));
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('navigates to BookingComposer when + Session is pressed', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <ChatScreen route={makeRoute() as any} navigation={navigation as any} />
    );
    await waitFor(() => getByLabelText('Propose a session'));
    fireEvent.press(getByLabelText('Propose a session'));
    expect(navigation.navigate).toHaveBeenCalledWith('BookingComposer', {
      matchId: 'match-1',
      sport: 'gym',
    });
  });

  it('shows the "Plan a session" banner with a Find a court CTA', async () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // banner is rendered above the loader
    const { getByText, getByLabelText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    getByText('Plan a session');
    getByText('Find a court and propose a time.');
    getByLabelText('Find a court');
  });

  it('navigates to BookingComposer with openCourtPicker=true when Find a court is pressed', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <ChatScreen route={makeRoute() as any} navigation={navigation as any} />
    );
    await waitFor(() => getByLabelText('Find a court'));
    fireEvent.press(getByLabelText('Find a court'));
    expect(navigation.navigate).toHaveBeenCalledWith('BookingComposer', {
      matchId: 'match-1',
      sport: 'gym',
      openCourtPicker: true,
    });
  });

  it('does not surface any Google Calendar copy in the chat', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { queryByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => queryByText('Plan a session'));
    expect(queryByText(/google calendar/i)).toBeNull();
    expect(queryByText(/calendar/i)).toBeNull();
  });

  // ── Composer readability (real-device fix) ────────────────────────────────

  it('renders the composer as multiline with a readable minHeight and a capped maxHeight', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByPlaceholderText, getByLabelText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => getByPlaceholderText('Message…'));

    const { StyleSheet } = require('react-native');
    const input = getByPlaceholderText('Message…');
    expect(input.props.multiline).toBe(true);
    expect(input.props.textAlignVertical).toBe('top');

    // Style assertions pin the visibility contract: the composer must give
    // the user a readable resting target (≥ 48 px, well above the previous
    // ~36 px clipping) and cap multi-line growth so the keyboard can never
    // eat the message list.
    const inputStyle = StyleSheet.flatten(input.props.style);
    expect(inputStyle.minHeight).toBeGreaterThanOrEqual(48);
    expect(inputStyle.maxHeight).toBeGreaterThanOrEqual(120);
    expect(inputStyle.maxHeight).toBeLessThanOrEqual(140);

    // The Send button is height-matched to the input's resting height so a
    // single-line composer reads as one unified row.
    const sendStyle = StyleSheet.flatten(getByLabelText('Send').props.style);
    expect(sendStyle.minHeight).toBeGreaterThanOrEqual(48);
  });

  // ── Keyboard layout (real-device fix) ──────────────────────────────────────

  it('renders the composer + send + Find a court inside a single KeyboardAvoidingView', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByPlaceholderText, getByLabelText, UNSAFE_queryAllByType } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => getByPlaceholderText('Message…'));

    // The fix wraps the entire chat body — header, planning banner, message
    // list and composer — in a single KAV so iOS padding / Android height
    // shifts everything together.
    const { KeyboardAvoidingView } = require('react-native');
    const kavs = UNSAFE_queryAllByType(KeyboardAvoidingView);
    expect(kavs.length).toBe(1);

    // Composer + send + Find a court are all reachable in the same render —
    // i.e., the keyboard fix must not have hidden any of them.
    expect(getByPlaceholderText('Message…')).toBeTruthy();
    expect(getByLabelText('Send')).toBeTruthy();
    expect(getByLabelText('Find a court')).toBeTruthy();
    expect(getByLabelText('Propose a session')).toBeTruthy();
  });

  // ── WebSocket real-time ────────────────────────────────────────────────────

  it('opens a WebSocket connection on mount with the correct URL', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    render(<ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />);
    await waitFor(() => expect(mockWsInstances.length).toBe(1));
    expect(mockWsInstances[0].url).toBe(
      'ws://localhost:8000/matches/match-1/ws?token=test-jwt-token'
    );
  });

  it('appends a message received via WebSocket to the list', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { findByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    await waitFor(() => expect(mockWsInstances.length).toBe(1));

    act(() => {
      mockWsInstances[0].onmessage?.({
        data: JSON.stringify({
          id: 'ws-msg-1',
          matchId: 'match-1',
          senderId: 'partner-456',
          body: 'Real-time hello!',
          createdAt: '2026-04-08T10:00:00Z',
        }),
      });
    });

    await findByText('Real-time hello!');
  });

  it('does not duplicate when a WebSocket frame arrives for the same id we just POSTed (real-device regression)', async () => {
    // Race: user taps Send → POST resolves with msg id X → before the React
    // setState commits, the server WS broadcasts the same msg id X back.
    // Both paths push the message; without dedup, FlatList renders two
    // children with the same key. This pin keeps that regression closed.
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const sentId = '63dd8190-86bf-4a49-801b-fe69ab9c5eaf';
    const sentMsg = {
      id: sentId,
      matchId: 'match-1',
      senderId: 'me-123',
      body: 'Race this!',
      createdAt: '2026-04-08T09:00:00Z',
    };
    mockApiPost.mockResolvedValue(sentMsg);

    const { getByPlaceholderText, getByLabelText, getAllByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    await waitFor(() => getByPlaceholderText('Message…'));
    await waitFor(() => expect(mockWsInstances.length).toBe(1));

    // Send + WS echo of the same id, in the order that triggered the bug.
    fireEvent.changeText(getByPlaceholderText('Message…'), 'Race this!');
    await act(async () => {
      fireEvent.press(getByLabelText('Send'));
    });
    act(() => {
      mockWsInstances[0].onmessage?.({ data: JSON.stringify(sentMsg) });
    });

    await waitFor(() => {
      // Exactly one bubble in the rendered list — not two.
      expect(getAllByText('Race this!').length).toBe(1);
    });
  });

  it('does not duplicate when the initial fetch returns the same id twice', async () => {
    // Defensive: if a malformed page or a server-side bug ever returns the
    // same id twice in /matches/:id/messages, the screen must still render
    // exactly one bubble (not crash, not warn).
    const dupId = 'dup-1';
    const m = {
      id: dupId,
      matchId: 'match-1',
      senderId: 'partner-456',
      body: 'Once is enough',
      createdAt: '2026-04-08T08:00:00Z',
    };
    mockApiGet.mockResolvedValue({
      items: [m, { ...m, body: 'second copy with the same id' }],
      total: 2,
      limit: 100,
      offset: 0,
    });
    const { getAllByText, queryByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    await waitFor(() => {
      expect(getAllByText('Once is enough').length).toBe(1);
    });
    // Dedup keeps the FIRST occurrence — second copy must not render.
    expect(queryByText('second copy with the same id')).toBeNull();
  });

  it('deduplicates a WS message already in the local list', async () => {
    const existingMsg = {
      id: 'msg-already',
      matchId: 'match-1',
      senderId: 'partner-456',
      body: 'Already here',
      createdAt: '2026-04-08T08:00:00Z',
    };
    mockApiGet.mockResolvedValue({ items: [existingMsg], total: 1, limit: 100, offset: 0 });
    const { getAllByText } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    await waitFor(() => expect(mockWsInstances.length).toBe(1));

    act(() => {
      mockWsInstances[0].onmessage?.({ data: JSON.stringify(existingMsg) });
    });

    // Message text should appear exactly once
    await waitFor(() => {
      expect(getAllByText('Already here').length).toBe(1);
    });
  });

  it('closes the WebSocket on unmount', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { unmount } = render(
      <ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );

    await waitFor(() => expect(mockWsInstances.length).toBe(1));
    unmount();
    expect(mockWsInstances[0].close).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed WebSocket frames', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    render(<ChatScreen route={makeRoute() as any} navigation={makeNavigation() as any} />);

    await waitFor(() => expect(mockWsInstances.length).toBe(1));

    expect(() => {
      act(() => {
        mockWsInstances[0].onmessage?.({ data: 'not valid json{{' });
      });
    }).not.toThrow();
  });
});
