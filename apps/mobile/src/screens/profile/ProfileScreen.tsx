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
      .get<{ connected: boolean }>('/users/me/google-calendar/status')
      .then((data) => setGcalConnected(data.connected))
      .catch(() => {});
  }, []);

  const handleGoogleCalendarConnect = useCallback(async () => {
    setGcalConnecting(true);
    try {
      const { url } = await api.get<{ url: string }>('/users/me/google-calendar/auth-url');
      const result = await WebBrowser.openAuthSessionAsync(url);
      if (result.type === 'success') {
        // Re-check status after browser closes
        const status = await api.get<{ connected: boolean }>('/users/me/google-calendar/status');
        setGcalConnected(status.connected);
      }
    } catch {
      // Swallow — server may not have Google configured yet
    } finally {
      setGcalConnecting(false);
    }
  }, []);

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
          <ActivityIndicator size="large" color={colors.accent} />
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Account</Text>
          <Text style={styles.title}>Profile</Text>
        </View>

        {error ? (
          <View style={styles.section}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : profile ? (
          <>
            {/* Avatar + name */}
            <View style={styles.avatarRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {profile.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.avatarInfo}>
                <Text style={styles.displayName}>{profile.displayName}</Text>
                {profile.suburb ? (
                  <Text style={styles.suburb}>{profile.suburb}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => navigation.navigate('EditProfile')}
                style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </Pressable>
            </View>

            {/* Bio */}
            {profile.bio ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>About</Text>
                <Text style={styles.bioText}>{profile.bio}</Text>
              </View>
            ) : null}

            {/* Sport profiles */}
            {sportProfiles && sportProfiles.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Sports</Text>
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
          </>
        ) : (
          /* No profile created yet */
          <View style={styles.section}>
            <Text style={styles.emptyTitle}>Profile not set up</Text>
            <Text style={styles.emptyBody}>
              Complete onboarding to build your workout partner profile.
            </Text>
          </View>
        )}

        {/* Google Calendar */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Integrations</Text>
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
          ) : (
            <Pressable
              style={({ pressed }) => [styles.integrationButton, pressed && styles.pressed]}
              onPress={handleGoogleCalendarConnect}
              disabled={gcalConnecting}
              accessibilityRole="button"
            >
              {gcalConnecting ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={styles.integrationButtonText}>Connect Google Calendar</Text>
              )}
            </Pressable>
          )}
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Legal</Text>
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

        {/* Logout */}
        <View style={styles.logoutSection}>
          <Pressable
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
            onPress={logout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>

        {/* Delete account */}
        <View style={styles.deleteSection}>
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

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  eyebrow: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h2,
  },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textInverse,
  },
  avatarInfo: {
    flex: 1,
  },
  editButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  editButtonText: {
    ...typography.label,
    color: colors.textPrimary,
  },
  displayName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  suburb: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  bioText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  sportList: {
    gap: spacing.sm,
  },
  sportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  sportName: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sportLevel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  emptyTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  integrationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.separator,
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
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  integrationButtonText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  logoutSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  logoutText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  legalList: {
    gap: spacing.xs,
  },
  legalRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  legalRowText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  deleteSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
