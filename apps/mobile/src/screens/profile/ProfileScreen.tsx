import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../../components/Screen';
import { api } from '../../lib/api';
import { PRIVACY_URL, TERMS_URL } from '../../lib/legal';
import { useAuthStore } from '../../stores/auth';
import { sportLabel, useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

export function ProfileScreen() {
  const { logout } = useAuthStore();
  const { profile, sportProfiles, fetchProfile } = useProfileStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalConnecting, setGcalConnecting] = useState(false);
  // `configured` is gated by the server having GOOGLE_CLIENT_ID set in its
  // env. Default to true so older API builds (no `configured` in payload)
  // keep showing the Connect button. The server stamps it false in
  // unconfigured local/dev builds, which lets us hide the Connect button
  // and avoid spamming /auth-url -> 503.
  const [gcalConfigured, setGcalConfigured] = useState(true);
  const [gcalError, setGcalError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile()
      .catch((err) => {
        // 404 = profile not yet created — show prompt rather than error
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('404') && !msg.includes('not found')) {
          setError(msg || 'Failed to load profile.');
        }
      })
      .finally(() => setIsLoading(false));
  }, [fetchProfile]);

  useEffect(() => {
    api
      .get<{ connected: boolean; configured?: boolean }>('/users/me/google-calendar/status')
      .then((data) => {
        setGcalConnected(data.connected);
        if (typeof data.configured === 'boolean') setGcalConfigured(data.configured);
      })
      .catch(() => {});
  }, []);

  const handleGoogleCalendarConnect = useCallback(async () => {
    if (!gcalConfigured) return; // defensive: button is hidden, but never call /auth-url unconfigured
    setGcalError(null);
    setGcalConnecting(true);
    try {
      const { url } = await api.get<{ url: string }>('/users/me/google-calendar/auth-url');
      const result = await WebBrowser.openAuthSessionAsync(url);
      if (result.type === 'success') {
        // Re-check status after browser closes
        const status = await api.get<{ connected: boolean; configured?: boolean }>(
          '/users/me/google-calendar/status'
        );
        setGcalConnected(status.connected);
        if (typeof status.configured === 'boolean') setGcalConfigured(status.configured);
      }
    } catch (err) {
      // Surface the failure inline rather than silently swallowing — the
      // disabled-feature path is handled separately via `gcalConfigured`.
      setGcalError(
        err instanceof Error ? err.message : "Couldn't open Google Calendar sign-in."
      );
    } finally {
      setGcalConnecting(false);
    }
  }, [gcalConfigured]);

  const handleGoogleCalendarDisconnect = useCallback(async () => {
    try {
      await api.delete('/users/me/google-calendar/disconnect');
      setGcalConnected(false);
    } catch {}
  }, []);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your profile, matches, chat history, and bookings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/auth/me');
              // RootNavigator is token-gated, so clearing the store routes
              // the user back to the auth entry automatically.
              await logout();
            } catch {
              Alert.alert(
                'Delete failed',
                "Couldn't delete your account. Please try again or contact support."
              );
            }
          },
        },
      ]
    );
  }, [logout]);

  if (isLoading) {
    return (
      <Screen padded>
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand banner — blue MoveMate hero with the avatar overlapping the
            bottom edge. Two layered fills approximate the reference's blue-500
            -> blue-600 gradient without a gradient library. */}
        <View style={styles.banner}>
          <View style={styles.bannerOverlay} />
          <View style={styles.bannerHeader}>
            <Text style={styles.bannerEyebrow}>Account</Text>
            {profile ? (
              <Pressable
                onPress={() => navigation.navigate('EditProfile')}
                style={({ pressed }) => [styles.editChip, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
              >
                <Text style={styles.editChipText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Avatar + name block — overlaps the banner via negative top margin.
            We keep the page title `Profile` for parity with the reference page
            structure even though the banner now carries the brand. */}
        <View style={styles.identityBlock}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile?.displayName?.charAt(0).toUpperCase() ?? '·'}
              </Text>
            </View>
          </View>

          <Text style={styles.pageTitle}>Profile</Text>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : profile ? (
            <>
              <Text style={styles.displayName}>{profile.displayName}</Text>
              {profile.suburb ? (
                <Text style={styles.suburb}>{profile.suburb}</Text>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyTitle}>Profile not set up</Text>
              <Text style={styles.emptyBody}>
                Complete onboarding to build your workout partner profile.
              </Text>
            </View>
          )}
        </View>

        {/* Profile content cards — only shown when a profile exists. */}
        {!error && profile ? (
          <View style={styles.cardStack}>
            {profile.bio ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>About</Text>
                <Text style={styles.bioText}>{profile.bio}</Text>
              </View>
            ) : null}

            {sportProfiles && sportProfiles.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Sports</Text>
                <View style={styles.sportList}>
                  {sportProfiles.map((sp) => (
                    <View key={sp.sport} style={styles.sportRow}>
                      <Text style={styles.sportName}>
                        {sportLabel(sp.sport)}
                      </Text>
                      <Text style={styles.sportLevel}>
                        {sp.level.charAt(0).toUpperCase() + sp.level.slice(1)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Google Calendar */}
        <View style={styles.cardStack}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Integrations</Text>
            {gcalConnected ? (
              <View style={styles.integrationRow}>
                <Text style={styles.integrationLabel}>Google Calendar</Text>
                <Pressable
                  style={({ pressed }) => [styles.integrationAction, pressed && styles.pressed]}
                  onPress={handleGoogleCalendarDisconnect}
                  accessibilityRole="button"
                >
                  <Text style={styles.integrationActionText}>Disconnect</Text>
                </Pressable>
              </View>
            ) : !gcalConfigured ? (
              <View style={styles.integrationDisabled}>
                <Text style={styles.integrationDisabledTitle}>Google Calendar</Text>
                <Text style={styles.integrationDisabledBody}>
                  Calendar sync isn't configured for this build. It will be enabled in a future
                  release.
                </Text>
              </View>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [styles.integrationButton, pressed && styles.pressed]}
                  onPress={handleGoogleCalendarConnect}
                  disabled={gcalConnecting}
                  accessibilityRole="button"
                  accessibilityLabel="Connect Google Calendar"
                >
                  {gcalConnecting ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <Text style={styles.integrationButtonText}>Connect Google Calendar</Text>
                  )}
                </Pressable>
                {gcalError ? (
                  <Text style={styles.integrationErrorText}>{gcalError}</Text>
                ) : null}
              </>
            )}
          </View>

          {/* Legal */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Legal</Text>
            <View style={styles.legalList}>
              <Pressable
                style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]}
                onPress={() => Linking.openURL(PRIVACY_URL)}
                accessibilityRole="link"
                accessibilityLabel="Privacy Policy"
              >
                <Text style={styles.legalRowText}>Privacy Policy</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]}
                onPress={() => Linking.openURL(TERMS_URL)}
                accessibilityRole="link"
                accessibilityLabel="Terms of Service"
              >
                <Text style={styles.legalRowText}>Terms of Service</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Account actions */}
        <View style={styles.actionStack}>
          <Pressable
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
            onPress={logout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
            onPress={handleDeleteAccount}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
          >
            <Text style={styles.deleteText}>Delete my account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const BANNER_HEIGHT = 168;
const AVATAR_SIZE = 104;

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xxxl,
    backgroundColor: colors.surfaceElevated,
  },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Hero banner
  banner: {
    height: BANNER_HEIGHT,
    backgroundColor: colors.brand,
    overflow: 'hidden',
  },
  bannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.brandDark,
    opacity: 0.35,
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  bannerEyebrow: {
    ...typography.label,
    color: colors.brandSoft,
  },
  editChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  editChipText: {
    ...typography.label,
    color: colors.textInverse,
    letterSpacing: 0.6,
  },

  // Identity block (overlaps banner)
  identityBlock: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: -AVATAR_SIZE / 2,
  },
  avatarRing: {
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brandDarkest,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.textInverse,
  },
  pageTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  displayName: {
    ...typography.h1,
    fontSize: 26,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  suburb: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyBlock: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    marginTop: spacing.md,
    textAlign: 'center',
  },

  // Card stack
  cardStack: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    shadowColor: colors.brandDarkest,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardTitle: {
    ...typography.h3,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  bioText: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  sportList: {
    gap: spacing.sm,
  },
  sportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
  },
  sportName: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sportLevel: {
    ...typography.body,
    color: colors.brand,
    fontWeight: '600',
  },

  // Integrations
  integrationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
  },
  integrationLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  integrationAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  integrationActionText: {
    ...typography.label,
    color: colors.error,
  },
  integrationButton: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
  },
  integrationButtonText: {
    ...typography.button,
    color: colors.brand,
  },
  integrationDisabled: {
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  integrationDisabledTitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  integrationDisabledBody: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  integrationErrorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  // Legal
  legalList: {
    gap: spacing.xs,
  },
  legalRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
  },
  legalRowText: {
    ...typography.body,
    color: colors.textPrimary,
  },

  // Account actions
  actionStack: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  logoutText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  deleteButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  deleteText: {
    ...typography.button,
    color: colors.error,
  },
  pressed: {
    opacity: 0.65,
  },
});
