import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { HonorBadge } from '../../components/HonorBadge';
import { Screen } from '../../components/Screen';
import { useUserHonorSummary } from '../../hooks/useUserHonorSummary';
import { blockUser } from '../../lib/safety';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
import type { PublicProfileScreenProps } from '../../navigation/types';

/**
 * Public-safe view of another user.
 *
 * Renders only the fields a viewer is allowed to see — display name,
 * suburb, bio, sports — plus a sanitized Honor / Gang Score summary
 * fetched from /rank/users/{id}. Never renders moderation data,
 * attendance rows, attendance notes, or block/report records.
 */
export function PublicProfileScreen({
  navigation,
  route,
}: PublicProfileScreenProps) {
  const { userId, displayName, suburb, bio, sports } = route.params;
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const isSelf = currentUserId !== null && currentUserId === userId;

  const {
    summary,
    isLoading: honorLoading,
    error: honorError,
  } = useUserHonorSummary({ userId });

  const [isBlocking, setIsBlocking] = useState(false);

  const handleBlock = async () => {
    if (isBlocking) return;
    Alert.alert(
      'Block this user?',
      'Blocked users will be restricted from joining your games where supported.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setIsBlocking(true);
            try {
              await blockUser(userId);
              Alert.alert(
                'User blocked',
                'You will no longer see games hosted by this user.'
              );
              navigation.goBack();
            } catch (err) {
              Alert.alert(
                "Couldn't block this user",
                err instanceof Error ? err.message : 'Please try again.'
              );
            } finally {
              setIsBlocking(false);
            }
          },
        },
      ]
    );
  };

  const handleReport = () => {
    navigation.navigate('Report', {
      reportedUserId: userId,
      reportedName: displayName ?? 'this user',
    });
  };

  const showSafetyActions = !isSelf;
  // Hide the Honor block entirely on a hard error so a network failure
  // isn't mislabelled as "New player". 404 / no-summary flows through
  // to the HonorBadge fallback.
  const showHonorBlock = !honorError;

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.identityBlock}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(displayName ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.displayName}>{displayName ?? 'Player'}</Text>
          {suburb ? <Text style={styles.suburb}>{suburb}</Text> : null}
        </View>

        {showHonorBlock ? (
          <View style={styles.card} accessibilityLabel="Honor summary">
            <View style={styles.honorRow}>
              <Text style={styles.cardTitle}>Honor</Text>
              <HonorBadge
                honorLevel={summary?.honorLevel ?? null}
                honorScore={summary?.honorScore ?? null}
                isLoading={honorLoading && !summary}
                accessibilityLabel={
                  summary
                    ? `Honor ${summary.honorLevel} ${summary.honorScore}`
                    : 'Honor unavailable'
                }
              />
            </View>
            <Text style={styles.cardCopy}>
              Honor reflects attendance, fair play, and reliable hosting.
            </Text>
            {summary ? (
              <View style={styles.statsRow}>
                <Stat label="Gang Score" value={summary.gangScore} />
                <Stat
                  label="Completed games"
                  value={summary.completedGamesCount}
                />
                <Stat label="No-shows" value={summary.noShowCount} />
              </View>
            ) : null}
            {summary && summary.sportLevels.length > 0 ? (
              <View style={styles.sportsBlock}>
                <Text style={styles.sectionLabel}>Sport levels</Text>
                {summary.sportLevels.map((s) => (
                  <View key={s.sport} style={styles.sportRow}>
                    <Text style={styles.sportName}>{capitalize(s.sport)}</Text>
                    <Text style={styles.sportLevel}>
                      Lv {s.level} - {s.xp} XP
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {honorLoading && !summary ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : null}
          </View>
        ) : null}

        {sports && sports.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sports</Text>
            <View style={styles.chipRow}>
              {sports.map((s) => (
                <View key={s} style={styles.chip}>
                  <Text style={styles.chipText}>{capitalize(s)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {bio ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>About</Text>
            <Text style={styles.bioText}>{bio}</Text>
          </View>
        ) : null}

        {showSafetyActions ? (
          <View style={styles.safetyActions}>
            <Pressable
              onPress={handleReport}
              accessibilityRole="button"
              accessibilityLabel="Report user"
              style={({ pressed }) => [
                styles.safetyButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.safetyButtonText}>Report user</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleBlock()}
              disabled={isBlocking}
              accessibilityRole="button"
              accessibilityLabel="Block user"
              style={({ pressed }) => [
                styles.safetyButton,
                styles.safetyButtonDanger,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.safetyButtonDangerText}>
                {isBlocking ? 'Blocking…' : 'Block user'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCell} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  backText: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 32 },
  scroll: {
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  identityBlock: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  avatarText: {
    ...typography.h2,
    color: colors.brand,
  },
  displayName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  suburb: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: spacing.sm,
  },
  honorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  cardCopy: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statCell: {
    flexGrow: 1,
    minWidth: '30%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  sportsBlock: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  sportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  sportName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  sportLevel: {
    ...typography.body,
    color: colors.brand,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
  bioText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  safetyActions: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  safetyButton: {
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  safetyButtonText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  safetyButtonDanger: {
    borderColor: colors.error,
  },
  safetyButtonDangerText: {
    ...typography.button,
    color: colors.error,
  },
  loadingRow: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  pressed: { opacity: 0.65 },
});
