import { useCallback, useState } from 'react';
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
import { useEventDetail } from '../../hooks/useEvents';
import { useUserHonorSummary } from '../../hooks/useUserHonorSummary';
import {
  type SelfAttendanceStatus,
  attendanceStatusLabel,
  formatEventWhen,
  selfReportAttendance,
  sportLabelForBattle,
} from '../../lib/events';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
import type { BattleDetailScreenProps } from '../../navigation/types';

export function BattleDetailScreen({ navigation, route }: BattleDetailScreenProps) {
  const { eventId } = route.params;
  const { detail, isLoading, error, join, leave, refresh } = useEventDetail({
    eventId,
  });
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  // Surface host Honor at the decision point. Cached at the lib layer
  // so duplicate host_user_ids across the Battle list don't re-fetch.
  const {
    summary: hostHonor,
    isLoading: hostHonorLoading,
    error: hostHonorError,
  } = useUserHonorSummary({ userId: detail?.hostUserId ?? null });
  const [isActing, setIsActing] = useState(false);
  const [selfReportSaving, setSelfReportSaving] = useState(false);
  const [selfReportError, setSelfReportError] = useState<string | null>(null);
  const [selfReportSaved, setSelfReportSaved] = useState<SelfAttendanceStatus | null>(
    null
  );

  const handleJoin = useCallback(async () => {
    if (isActing) return;
    setIsActing(true);
    try {
      await join();
    } catch (err) {
      Alert.alert(
        "Couldn't join this game.",
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsActing(false);
    }
  }, [isActing, join]);

  const handleLeave = useCallback(async () => {
    if (isActing) return;
    setIsActing(true);
    try {
      await leave();
    } catch (err) {
      Alert.alert(
        "Couldn't leave this game.",
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsActing(false);
    }
  }, [isActing, leave]);

  if (isLoading && !detail) {
    return (
      <Screen padded={false}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <View style={styles.centred}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (error && !detail) {
    return (
      <Screen padded={false}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <View style={styles.centred}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void refresh()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading battle"
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!detail) return null;

  const isFull = detail.status === 'full' || detail.spotsLeft <= 0;
  const isCancelled = detail.status === 'cancelled';
  const isCompleted = detail.status === 'completed';
  const isHost = currentUserId !== null && currentUserId === detail.hostUserId;
  // Active joined non-host participant — eligible for self-report.
  const isParticipant = detail.hasJoined && !isHost;
  // Saved-state reflects only the self-report performed in this
  // session. Persisted attendance is no longer leaked via GET
  // /events/{id} — fetching it back would require a separate
  // /attendance call which is out of scope for this patch.
  const ownAttendanceStatus = selfReportSaved;

  const handleSelfReport = async (statusValue: SelfAttendanceStatus) => {
    if (selfReportSaving || !eventId) return;
    setSelfReportSaving(true);
    setSelfReportError(null);
    try {
      await selfReportAttendance(eventId, { attendanceStatus: statusValue });
      setSelfReportSaved(statusValue);
    } catch (err) {
      setSelfReportError(
        err instanceof Error ? err.message : 'Could not save attendance.'
      );
    } finally {
      setSelfReportSaving(false);
    }
  };

  // Primary CTA selection. Order: Joined → Cancelled/Completed disabled →
  // Full disabled → Join.
  let ctaLabel: string = 'Join';
  let ctaState: 'join' | 'joined' | 'full' | 'disabled' = 'join';
  if (detail.hasJoined) {
    ctaLabel = 'Joined · Leave';
    ctaState = 'joined';
  } else if (isCancelled || isCompleted) {
    ctaLabel = isCancelled ? 'Cancelled' : 'Completed';
    ctaState = 'disabled';
  } else if (isFull) {
    ctaLabel = 'Full';
    ctaState = 'full';
  }

  const ctaDisabled =
    isActing || ctaState === 'full' || ctaState === 'disabled';
  const onPressCta = () => {
    if (ctaState === 'joined') {
      void handleLeave();
    } else if (ctaState === 'join') {
      void handleJoin();
    }
  };

  return (
    <Screen padded={false}>
      <ScreenHeader onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.section}>
          <View style={styles.titleRow}>
            <ModeBadge mode={detail.mode} />
            <Text style={styles.sportLabel}>
              {sportLabelForBattle(detail.sport)}
            </Text>
          </View>
          <Text style={styles.title}>{detail.title}</Text>
          <Text style={styles.when}>{formatEventWhen(detail.startsAt)}</Text>
          <Text style={styles.location}>{detail.locationText}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Players</Text>
          <Text style={styles.countLine}>
            {detail.participantCount}/{detail.capacity} in · {detail.spotsLeft}{' '}
            spots left
          </Text>
        </View>

        {detail.host ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Host</Text>
            <View style={styles.hostRow}>
              <View style={styles.hostAvatar}>
                <Text style={styles.hostInitial}>
                  {(detail.host.displayName || 'H').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.hostInfo}>
                <Text style={styles.hostName}>{detail.host.displayName}</Text>
                <Text style={styles.hostMeta}>SportsGang host</Text>
              </View>
              {/*
                Hide the pill ONLY on a hard error (network/server).
                404 / null userId flow through as summary=null and
                render the badge's "New player" fallback.
              */}
              {hostHonorError ? null : (
                <HonorBadge
                  honorLevel={hostHonor?.honorLevel ?? null}
                  honorScore={hostHonor?.honorScore ?? null}
                  isLoading={hostHonorLoading && !hostHonor}
                  accessibilityLabel={
                    hostHonor
                      ? `Host honor ${hostHonor.honorLevel} ${hostHonor.honorScore}`
                      : 'Host honor unavailable'
                  }
                />
              )}
            </View>
          </View>
        ) : null}

        {detail.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Details</Text>
            <Text style={styles.description}>{detail.description}</Text>
          </View>
        ) : null}

        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Only join if you can attend. No-shows affect your Honor.
          </Text>
        </View>

        {isHost ? (
          <View style={styles.attendanceSection}>
            <Text style={styles.sectionLabel}>Attendance</Text>
            <Text style={styles.attendanceCopy}>
              Only mark no-show when the player clearly did not attend.
            </Text>
            <Pressable
              onPress={() =>
                navigation.navigate('AttendanceCheck', { eventId: detail.id })
              }
              accessibilityRole="button"
              accessibilityLabel="Confirm attendance"
              style={({ pressed }) => [
                styles.attendanceCta,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.attendanceCtaText}>Confirm attendance</Text>
            </Pressable>
          </View>
        ) : null}

        {isParticipant ? (
          <View style={styles.attendanceSection}>
            <Text style={styles.sectionLabel}>Did you attend this game?</Text>
            <Text style={styles.attendanceCopy}>
              Attendance helps keep Honor fair.
            </Text>
            {ownAttendanceStatus ? (
              <Text
                style={styles.attendanceSaved}
                accessibilityLabel="Attendance saved"
              >
                Attendance saved · {attendanceStatusLabel(ownAttendanceStatus)}
              </Text>
            ) : null}
            <View style={styles.attendanceButtonRow}>
              <Pressable
                onPress={() => void handleSelfReport('attended')}
                disabled={selfReportSaving}
                accessibilityRole="button"
                accessibilityLabel="Yes, I attended"
                style={({ pressed }) => [
                  styles.attendanceButton,
                  styles.attendanceButtonPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.attendanceButtonPrimaryText}>
                  Yes, I attended
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSelfReport('excused')}
                disabled={selfReportSaving}
                accessibilityRole="button"
                accessibilityLabel="I could not attend"
                style={({ pressed }) => [
                  styles.attendanceButton,
                  styles.attendanceButtonSecondary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.attendanceButtonSecondaryText}>
                  I could not attend
                </Text>
              </Pressable>
            </View>
            {selfReportError ? (
              <Text style={styles.attendanceErrorText}>{selfReportError}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.secondaryActions}>
          <SecondaryAction
            label="Share"
            onPress={() =>
              Alert.alert('Share', 'Sharing is coming in a later release.')
            }
            accessibilityLabel="Share this game"
          />
          <SecondaryAction
            label="Report game"
            onPress={() =>
              Alert.alert(
                'Report',
                'Event reporting is coming in the next release.'
              )
            }
            accessibilityLabel="Report this game"
          />
        </View>
      </ScrollView>

      <View style={styles.ctaBar}>
        <Pressable
          onPress={onPressCta}
          disabled={ctaDisabled}
          accessibilityRole="button"
          accessibilityLabel={
            ctaState === 'joined'
              ? 'Leave this game'
              : ctaState === 'join'
                ? 'Join this game'
                : ctaLabel
          }
          accessibilityState={{
            disabled: ctaState === 'full' || ctaState === 'disabled',
          }}
          style={({ pressed }) => [
            styles.cta,
            ctaState === 'joined' && styles.ctaJoined,
            (ctaState === 'full' || ctaState === 'disabled') && styles.ctaFull,
            pressed && styles.pressed,
          ]}
        >
          {isActing ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text
              style={[
                styles.ctaText,
                ctaState === 'joined' && styles.ctaTextJoined,
                (ctaState === 'full' || ctaState === 'disabled') &&
                  styles.ctaTextFull,
              ]}
            >
              {ctaLabel}
            </Text>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

function ScreenHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Text style={styles.backText}>{'←'}</Text>
      </Pressable>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>Battle</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function ModeBadge({ mode }: { mode: 'casual' | 'ranked' }) {
  const isRanked = mode === 'ranked';
  return (
    <View
      style={[
        styles.modeBadge,
        isRanked ? styles.modeBadgeRanked : styles.modeBadgeCasual,
      ]}
    >
      <Text
        style={[
          styles.modeBadgeText,
          isRanked ? styles.modeBadgeTextRanked : styles.modeBadgeTextCasual,
        ]}
      >
        {isRanked ? 'RANKED' : 'CASUAL'}
      </Text>
    </View>
  );
}

function SecondaryAction({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
    >
      <Text style={styles.secondaryActionText}>{label}</Text>
    </Pressable>
  );
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
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sportLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  title: {
    ...typography.h2,
  },
  when: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  location: {
    ...typography.body,
    color: colors.textSecondary,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  countLine: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hostAvatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostInitial: {
    ...typography.h3,
    color: colors.brand,
  },
  hostInfo: { flex: 1 },
  hostName: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  hostMeta: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  description: {
    ...typography.body,
    color: colors.textPrimary,
  },
  warningBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  warningText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  secondaryActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  secondaryAction: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryActionText: {
    ...typography.button,
    fontSize: 13,
    color: colors.textSecondary,
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
  },
  cta: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaText: {
    ...typography.button,
    color: colors.textInverse,
  },
  ctaJoined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.brand,
  },
  ctaTextJoined: {
    color: colors.brand,
  },
  ctaFull: {
    backgroundColor: colors.border,
  },
  ctaTextFull: {
    color: colors.textTertiary,
  },
  modeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  modeBadgeRanked: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  modeBadgeCasual: {
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  modeBadgeText: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  modeBadgeTextRanked: {
    color: colors.brand,
  },
  modeBadgeTextCasual: {
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.button,
    color: colors.brand,
  },
  pressed: { opacity: 0.65 },
  attendanceSection: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  attendanceCopy: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  attendanceCta: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
  },
  attendanceCtaText: {
    ...typography.button,
    color: colors.textInverse,
  },
  attendanceButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  attendanceButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  attendanceButtonPrimary: {
    backgroundColor: colors.brand,
  },
  attendanceButtonPrimaryText: {
    ...typography.button,
    color: colors.textInverse,
  },
  attendanceButtonSecondary: {
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: 'transparent',
  },
  attendanceButtonSecondaryText: {
    ...typography.button,
    color: colors.brand,
  },
  attendanceSaved: {
    ...typography.bodySmall,
    color: colors.brand,
  },
  attendanceErrorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
