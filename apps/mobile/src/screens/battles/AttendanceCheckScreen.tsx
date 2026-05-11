import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { useEventAttendance, useEventDetail } from '../../hooks/useEvents';
import {
  type AttendanceEntry,
  type AttendanceStatus,
  attendanceStatusLabel,
  formatEventWhen,
  sportLabelForBattle,
} from '../../lib/events';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
import type { AttendanceCheckScreenProps } from '../../navigation/types';

/**
 * Host-only attendance check.
 *
 * Routed to from BattleDetail's "Confirm attendance" CTA. Non-hosts
 * who land here see a friendly inaccessible state — server already
 * returns a self-only payload for them, so the UI hides the host
 * controls in that case.
 */

type Choice = AttendanceStatus | 'not_sure';

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'attended', label: 'Attended' },
  { value: 'no_show', label: 'No-show' },
  { value: 'excused', label: 'Excused' },
  { value: 'not_sure', label: 'Not sure' },
];

export function AttendanceCheckScreen({
  navigation,
  route,
}: AttendanceCheckScreenProps) {
  const { eventId } = route.params;
  const { detail } = useEventDetail({ eventId });
  const { data, isLoading, error, updateAsHost, refresh } = useEventAttendance({
    eventId,
  });
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [savingFor, setSavingFor] = useState<string | null>(null);

  // Host gate. Two signals must agree:
  //   1. The viewer is the host of the loaded event (detail.hostUserId).
  //   2. The attendance response was returned in the host-scope shape
  //      (data.hostUserId === currentUserId).
  // For non-hosts the server already returns a self-only payload, but
  // we explicitly suppress all host marking controls regardless.
  const viewerIsHost =
    currentUserId !== null &&
    ((detail !== null && detail.hostUserId === currentUserId) ||
      (data !== null && data.hostUserId === currentUserId));

  const onPick = useCallback(
    async (participantUserId: string, choice: Choice) => {
      if (choice === 'not_sure') {
        // 'Not sure' is a UI-only no-op for this stream — no mark
        // recorded, so the row stays as whatever it was.
        return;
      }
      if (savingFor) return;
      setSavingFor(participantUserId);
      try {
        await updateAsHost({
          participantUserId,
          attendanceStatus: choice,
        });
      } catch (err) {
        Alert.alert(
          'Could not save attendance',
          err instanceof Error ? err.message : 'Please try again.'
        );
      } finally {
        setSavingFor(null);
      }
    },
    [savingFor, updateAsHost]
  );

  const activeItems = useMemo(
    () => (data?.items ?? []).filter((it) => it.participantStatus === 'joined'),
    [data]
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>{'←'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Confirm attendance</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {detail ? (
          <View style={styles.summary}>
            <Text style={styles.summarySport}>
              {sportLabelForBattle(detail.sport)}
            </Text>
            <Text style={styles.summaryTitle} numberOfLines={2}>
              {detail.title}
            </Text>
            <Text style={styles.summaryMeta}>
              {formatEventWhen(detail.startsAt)} · {detail.locationText}
            </Text>
          </View>
        ) : null}

        {viewerIsHost ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Only mark no-show when the player clearly did not attend.
            </Text>
          </View>
        ) : null}

        {isLoading && !data ? (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : error ? (
          <View style={styles.centred}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => void refresh()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading attendance"
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : !viewerIsHost ? (
          <View
            style={styles.centred}
            accessibilityLabel="Attendance check is host only"
          >
            <Text style={styles.emptyTitle}>Host only</Text>
            <Text style={styles.emptyText}>
              Only the event host can mark attendance from here.
            </Text>
          </View>
        ) : activeItems.length === 0 ? (
          <View style={styles.centred}>
            <Text style={styles.emptyText}>No active participants yet.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {activeItems.map((p) => (
              <ParticipantRow
                key={p.participantUserId}
                participant={p}
                isSaving={savingFor === p.participantUserId}
                onPick={(c) => void onPick(p.participantUserId, c)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

interface ParticipantRowProps {
  participant: AttendanceEntry;
  isSaving: boolean;
  onPick: (choice: Choice) => void;
}

function ParticipantRow({ participant, isSaving, onPick }: ParticipantRowProps) {
  return (
    <View
      style={styles.row}
      accessibilityLabel={`Attendance row for ${participant.displayName}`}
      testID={`attendance-row-${participant.participantUserId}`}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.rowName} numberOfLines={1}>
          {participant.displayName}
        </Text>
        <Text style={styles.rowStatus}>
          {attendanceStatusLabel(
            participant.attendanceStatus as AttendanceStatus
          )}
        </Text>
      </View>
      <View style={styles.choices}>
        {CHOICES.map((c) => {
          const active = c.value === participant.attendanceStatus;
          return (
            <Pressable
              key={c.value}
              onPress={() => onPick(c.value)}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${participant.displayName} as ${c.label}`}
              accessibilityState={{ selected: active, disabled: isSaving }}
              style={({ pressed }) => [
                styles.choice,
                active && styles.choiceActive,
                pressed && !isSaving && styles.pressed,
              ]}
            >
              <Text
                style={[styles.choiceText, active && styles.choiceTextActive]}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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
    gap: spacing.md,
  },
  summary: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: 4,
  },
  summarySport: {
    ...typography.label,
    color: colors.textSecondary,
  },
  summaryTitle: {
    ...typography.h2,
  },
  summaryMeta: {
    ...typography.body,
    color: colors.textSecondary,
  },
  warningBox: {
    marginHorizontal: spacing.lg,
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
  centred: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
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
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    gap: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
  },
  rowStatus: {
    ...typography.label,
    color: colors.brand,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  choice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  choiceText: {
    ...typography.button,
    fontSize: 13,
    color: colors.textSecondary,
  },
  choiceTextActive: {
    color: colors.textInverse,
  },
  pressed: { opacity: 0.65 },
});
