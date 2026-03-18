import { useCallback, useEffect, useState } from 'react';
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
import { api } from '../../lib/api';
import { addBookingToCalendar } from '../../lib/calendar';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
import type { BookingDetailScreenProps } from '../../navigation/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingDetail {
  id: string;
  matchId: string;
  proposerId: string;
  partnerId: string;
  sport: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  notes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  partner: {
    userId: string;
    displayName: string;
    suburb?: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-AU', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    proposed: 'Awaiting confirmation',
    confirmed: 'Confirmed',
    declined: 'Declined',
    cancelled: 'Cancelled',
    completed: 'Completed',
    no_show: 'No-show',
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  if (status === 'confirmed' || status === 'completed') return colors.success;
  if (status === 'declined' || status === 'cancelled' || status === 'no_show')
    return colors.error;
  return colors.textSecondary;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function BookingDetailScreen({ route, navigation }: BookingDetailScreenProps) {
  const { bookingId } = route.params;
  const { user } = useAuthStore();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBooking = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<BookingDetail>(`/bookings/${bookingId}`);
      setBooking(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load booking.');
    } finally {
      setIsLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  const performTransition = useCallback(
    async (action: string) => {
      setIsActing(true);
      try {
        const updated = await api.post<BookingDetail>(`/bookings/${bookingId}/${action}`, {});
        setBooking(updated);
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setIsActing(false);
      }
    },
    [bookingId]
  );

  const handleAddToCalendar = useCallback(async () => {
    if (!booking) return;
    const added = await addBookingToCalendar({
      title: `${booking.sport === 'gym' ? 'Gym' : 'Golf'} with ${booking.partner.displayName}`,
      startDate: new Date(booking.startsAt),
      endDate: new Date(booking.endsAt),
      location: booking.location,
      notes: booking.notes,
    });
    if (added) {
      Alert.alert('Added', 'Session added to your calendar.');
    } else {
      Alert.alert('Permission denied', 'Allow calendar access in Settings to use this feature.');
    }
  }, [booking]);

  if (isLoading) {
    return (
      <Screen padded>
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (error || !booking) {
    return (
      <Screen padded>
        <Text style={styles.errorText}>{error ?? 'Booking not found.'}</Text>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      {/* Header */}
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
          <Text style={styles.headerTitle}>Session</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Status pill */}
        <View style={styles.statusRow}>
          <View style={[styles.statusPill, { borderColor: statusColor(booking.status) }]}>
            <Text style={[styles.statusText, { color: statusColor(booking.status) }]}>
              {statusLabel(booking.status)}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.section}>
          <DetailRow label="With" value={booking.partner.displayName} />
          <DetailRow
            label="Sport"
            value={booking.sport === 'gym' ? 'Gym' : 'Golf'}
          />
          <DetailRow label="Starts" value={formatDateTime(booking.startsAt)} />
          <DetailRow label="Ends" value={formatDateTime(booking.endsAt)} />
          {booking.location ? (
            <DetailRow label="Location" value={booking.location} />
          ) : null}
          {booking.notes ? (
            <DetailRow label="Notes" value={booking.notes} />
          ) : null}
        </View>

        {/* Add to Calendar — only when confirmed */}
        {booking.status === 'confirmed' ? (
          <View style={styles.section}>
            <Pressable
              style={({ pressed }) => [styles.calendarButton, pressed && styles.pressed]}
              onPress={handleAddToCalendar}
              accessibilityRole="button"
            >
              <Text style={styles.calendarButtonText}>Add to Calendar</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Action buttons — conditionally shown based on status */}
        {isActing ? (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <View style={styles.actions}>
            {booking.status === 'proposed' ? (
              (() => {
                const isProposer = booking.proposerId === user?.id;
                return isProposer ? (
                  <ActionButton
                    label="Cancel"
                    variant="ghost"
                    onPress={() => performTransition('cancel')}
                  />
                ) : (
                  <>
                    <ActionButton
                      label="Confirm"
                      variant="primary"
                      onPress={() => performTransition('confirm')}
                    />
                    <ActionButton
                      label="Decline"
                      variant="ghost"
                      onPress={() => performTransition('decline')}
                    />
                    <ActionButton
                      label="Cancel"
                      variant="ghost"
                      onPress={() => performTransition('cancel')}
                    />
                  </>
                );
              })()
            ) : booking.status === 'confirmed' ? (
              <>
                <ActionButton
                  label="Mark completed"
                  variant="primary"
                  onPress={() => performTransition('complete')}
                />
                <ActionButton
                  label="Record no-show"
                  variant="ghost"
                  onPress={() => performTransition('no-show')}
                />
                <ActionButton
                  label="Cancel"
                  variant="ghost"
                  onPress={() => performTransition('cancel')}
                />
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  variant,
  onPress,
}: {
  label: string;
  variant: 'primary' | 'ghost';
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
        variant === 'primary' ? styles.actionButtonPrimary : styles.actionButtonGhost,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === 'primary'
            ? styles.actionButtonTextPrimary
            : styles.actionButtonTextGhost,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 32 },
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  statusRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusText: {
    ...typography.label,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  detailLabel: {
    ...typography.label,
    color: colors.textTertiary,
    flex: 1,
  },
  detailValue: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 2,
    textAlign: 'right',
  },
  calendarButton: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  calendarButtonText: {
    ...typography.button,
    color: colors.brand,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  actionButton: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: colors.brand,
  },
  actionButtonGhost: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    ...typography.button,
  },
  actionButtonTextPrimary: {
    color: colors.textInverse,
  },
  actionButtonTextGhost: {
    color: colors.textPrimary,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  pressed: { opacity: 0.65 },
});
