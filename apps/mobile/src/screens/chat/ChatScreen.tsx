import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../../components/Screen';
import { api, BASE_URL } from '../../lib/api';
import { dedupeMessagesById } from '../../lib/messages';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
import type { ChatScreenProps } from '../../navigation/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

interface MessageListResponse {
  items: Message[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function ChatScreen({ route, navigation }: ChatScreenProps) {
  const { matchId, partnerName, partnerId: routePartnerId, sport } = route.params;
  const { user, token } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  // iOS keyboard inset — bumps the visible composer above the keyboard.
  // Manual tracking is used because KeyboardAvoidingView's measured frame is
  // unreliable for non-Latin IMEs (Korean) when the keyboard frame changes
  // mid-frame. We listen to keyboardWillChangeFrame so the inset stays in
  // sync as the user toggles between Latin and Korean inputs. Android relies
  // on adjustResize and keeps inset = 0.
  const [keyboardInset, setKeyboardInset] = useState(0);
  const listRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const onChange = (e: { endCoordinates: { screenY: number; height: number } }) => {
      const screenHeight = Dimensions.get('window').height;
      // screenY is the keyboard's top y in screen coordinates; the visible
      // keyboard height is the gap between that and the screen bottom.
      const visibleKeyboardHeight = Math.max(0, screenHeight - e.endCoordinates.screenY);
      setKeyboardInset(visibleKeyboardHeight);
    };
    const onHide = () => setKeyboardInset(0);
    const showSub = Keyboard.addListener('keyboardWillChangeFrame', onChange);
    const hideSub = Keyboard.addListener('keyboardWillHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const partnerId = useRef<string | null>(routePartnerId);
  // Local guard: prevents the user from firing /blocks/:id twice in a row by
  // re-opening the safety menu while a block is mid-flight. Pure UX safety;
  // the backend is still the source of truth.
  const [isBlocking, setIsBlocking] = useState(false);

  const performBlock = useCallback(async () => {
    if (!partnerId.current || isBlocking) return;
    setIsBlocking(true);
    try {
      await api.post(`/blocks/${partnerId.current}`, {});
      Alert.alert(
        'User blocked',
        "You won't be matched or contacted by this user.",
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert(
        'Could not block',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsBlocking(false);
    }
  }, [isBlocking, navigation]);

  const confirmBlock = useCallback(() => {
    if (!partnerId.current || isBlocking) return;
    Alert.alert(
      'Block ' + partnerName + '?',
      "You won't see messages or activity from this user.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => void performBlock() },
      ]
    );
  }, [isBlocking, partnerName, performBlock]);

  const openSafetyMenu = useCallback(() => {
    const options = ['Report', 'Block', 'Cancel'];
    const destructiveIndex = 1;
    const cancelIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex },
        (idx) => {
          if (idx === 0 && partnerId.current) {
            navigation.navigate('Report', {
              reportedUserId: partnerId.current,
              reportedName: partnerName,
            });
          } else if (idx === 1) {
            confirmBlock();
          }
        }
      );
    } else {
      Alert.alert(partnerName, undefined, [
        {
          text: 'Report',
          onPress: () => {
            if (partnerId.current) {
              navigation.navigate('Report', {
                reportedUserId: partnerId.current,
                reportedName: partnerName,
              });
            }
          },
        },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => confirmBlock(),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [navigation, partnerName, confirmBlock]);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.get<MessageListResponse>(
        `/matches/${matchId}/messages?limit=100`
      );
      // Merge instead of replace: a WS-received message could have landed in
      // state while this fetch was in-flight (slow network, partner sent
      // mid-load). dedupeMessagesById keeps the FIRST occurrence so the
      // canonical history from data.items wins on overlap, and any tail-end
      // WS messages survive at the end. Defensive against duplicate rows in
      // the response too.
      setMessages((prev) => dedupeMessagesById([...data.items, ...prev]));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load messages.');
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // ── Real-time WebSocket connection ──────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const wsBase = BASE_URL.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/matches/${matchId}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const incoming = JSON.parse(event.data as string) as Message;
        // Use the shared dedupe helper so this path matches sendMessage and
        // fetchMessages — a single source of truth means a race between the
        // POST response and a WS echo of the same id can never duplicate.
        setMessages((prev) => dedupeMessagesById([...prev, incoming]));
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [matchId, token]);

  const sendMessage = useCallback(async () => {
    const body = draft.trim();
    if (!body || isSending) return;
    // Clear optimistically so the user can keep typing while the request flies.
    setDraft('');
    setIsSending(true);
    try {
      const msg = await api.post<Message>(`/matches/${matchId}/messages`, { body });
      // Dedupe-on-append: the WebSocket may have already broadcast this same
      // id back to us before the POST response resolved. Without this, both
      // paths would each push the message and React would warn:
      //   "Encountered two children with the same key: <id>"
      setMessages((prev) => dedupeMessagesById([...prev, msg]));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err) {
      // Send failed — restore the draft so the user doesn't lose their typing,
      // and surface the failure via Alert so they know to retry. Without this,
      // a flaky network silently swallows the message and the textbox just
      // becomes empty, which feels broken on real devices.
      setDraft(body);
      Alert.alert(
        'Could not send',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsSending(false);
    }
  }, [draft, isSending, matchId]);

  return (
    <Screen padded={false}>
      {/* Header — kept OUTSIDE the KeyboardAvoidingView so it stays anchored
          at the top regardless of keyboard state. */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>{'←'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName} numberOfLines={1}>
            {partnerName}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.bookButton, pressed && styles.pressed]}
            onPress={() =>
              navigation.navigate('BookingComposer', { matchId, sport })
            }
            accessibilityRole="button"
            accessibilityLabel="Propose a session"
          >
            <Text style={styles.bookButtonText}>+ Session</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.overflowButton, pressed && styles.pressed]}
            onPress={openSafetyMenu}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Text style={styles.overflowText}>⋯</Text>
          </Pressable>
        </View>
      </View>

      {/* Session-planning banner — also kept outside the KAV. The banner
          must not move when the keyboard opens; only the list+composer
          should shift. */}
      <View style={styles.planBanner}>
        <View style={styles.planBannerText}>
          <Text style={styles.planBannerTitle}>Plan a session</Text>
          <Text style={styles.planBannerSubtitle}>
            Find a court and propose a time.
          </Text>
        </View>
        <Pressable
          onPress={() =>
            navigation.navigate('BookingComposer', {
              matchId,
              sport,
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Find a court"
          style={({ pressed }) => [styles.findCourtCta, pressed && styles.pressed]}
        >
          <Text style={styles.findCourtCtaText}>Find a court</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : fetchError ? (
        <View style={styles.centred}>
          <Text style={styles.errorText}>{fetchError}</Text>
          <Pressable style={styles.retryButton} onPress={fetchMessages}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        // Single shared layout for both platforms. The composer is a normal
        // visible View below the FlatList — it must be tappable BEFORE the
        // keyboard opens, so it cannot live solely inside an
        // InputAccessoryView (the previous attempt's structural bug).
        //
        // Keyboard handling:
        //   - Android: rely on the OS via android:windowSoftInputMode=
        //     "adjustResize" (Expo default). The KAV here is just a flex:1
        //     wrapper — behavior=undefined, no manual lifting.
        //   - iOS: KAV behavior is undefined (no KAV-driven padding) and the
        //     composer's marginBottom is set from the iOS-only Keyboard event
        //     listener. This avoids double-lifting and gives reliable results
        //     for Korean / non-Latin IMEs where KAV's measured frame drifts.
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble message={item} isOwn={item.senderId !== routePartnerId} />
            )}
            style={styles.flex}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>
                  Say hello to {partnerName} to get things started.
                </Text>
              </View>
            }
          />
          <View
            style={[
              styles.inputRow,
              // Resting paddingBottom keeps the composer clear of the iPhone
              // home indicator when the keyboard is down.
              { paddingBottom: spacing.sm + insets.bottom },
              // iOS only: lift the composer by the visible keyboard height
              // (minus the home-indicator inset, which the keyboard absorbs)
              // so the input + Send button sit just above the keyboard, even
              // for Korean IMEs that change keyboard frame mid-frame.
              Platform.OS === 'ios' && keyboardInset > 0
                ? { marginBottom: Math.max(0, keyboardInset - insets.bottom) }
                : null,
            ]}
          >
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
              // Anchor multi-line text to the top edge — without this, Android
              // vertically centers the caret as the input grows, which makes
              // the first line appear to "jump" while typing.
              textAlignVertical="top"
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                (!draft.trim() || isSending) && styles.sendButtonDisabled,
                pressed && styles.pressed,
              ]}
              onPress={sendMessage}
              disabled={!draft.trim() || isSending}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  return (
    <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
      <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
        {message.body}
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    gap: spacing.sm,
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  backText: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bookButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  bookButtonText: {
    ...typography.label,
    color: colors.textInverse,
  },
  overflowButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  overflowText: {
    fontSize: 20,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  planBannerText: {
    flex: 1,
    gap: 2,
  },
  planBannerTitle: {
    ...typography.label,
    color: colors.textPrimary,
    letterSpacing: 0.6,
  },
  planBannerSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  findCourtCta: {
    backgroundColor: colors.brand,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  findCourtCtaText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 14,
  },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    // Larger bottom pad so the last bubble keeps clear of the composer's
    // top border AND the keyboard edge when the input grows multi-line.
    // Slightly bumped from spacing.md so a fresh send doesn't visually
    // crash into the input on real devices.
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand,
    borderBottomRightRadius: 3,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.separator,
    borderBottomLeftRadius: 3,
  },
  bubbleText: {
    ...typography.body,
    lineHeight: 20,
  },
  bubbleTextOwn: {
    color: colors.textInverse,
  },
  bubbleTextOther: {
    color: colors.textPrimary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    ...typography.bodyLarge,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    // 12 px vertical padding on each side keeps a single line of bodyLarge
    // (lineHeight 26) clearly inside the box without clipping the caret or
    // descenders. Combined with minHeight 48, an empty composer is a
    // comfortable resting target above the iOS HIG threshold.
    paddingVertical: 12,
    // Real-device QA: at the previous 44 px the typed text felt clipped on
    // an iPhone with the keyboard open. 48 gives the caret + first line
    // clear breathing room. maxHeight 132 lets the input grow to ~5 lines
    // before scrolling internally so the user can review what they're
    // typing without the keyboard ever covering the composer.
    minHeight: 48,
    maxHeight: 132,
  },
  sendButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    // Match the input's resting minHeight so a single-line composer reads
    // as one unified row. With alignItems: 'flex-end' on the parent, the
    // Send button stays bottom-aligned when the input grows multi-line.
    minHeight: 48,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
  sendButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  pressed: { opacity: 0.65 },
});
