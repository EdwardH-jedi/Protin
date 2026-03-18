import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { api } from '../../lib/api';
import { colors, radii, spacing, typography } from '../../theme';
import type { BookingComposerScreenProps } from '../../navigation/types';

// ─── Screen ──────────────────────────────────────────────────────────────────

export function BookingComposerScreen({ route, navigation }: BookingComposerScreenProps) {
  const { matchId, sport } = route.params;

  const [date, setDate] = useState('');        // YYYY-MM-DD
  const [startTime, setStartTime] = useState(''); // HH:MM
  const [endTime, setEndTime] = useState('');     // HH:MM
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    date.trim().length === 10 &&
    startTime.trim().length === 5 &&
    endTime.trim().length === 5 &&
    !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const startsAt = `${date}T${startTime}:00`;
      const endsAt = `${date}T${endTime}:00`;

      const booking = await api.post<{ id: string }>('/bookings', {
        matchId,
        sport,
        startsAt,
        endsAt,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      navigation.replace('BookingDetail', { bookingId: booking.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to propose session.');
      setIsSubmitting(false);
    }
  };

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
            <Text style={styles.headerTitle}>Propose a session</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Field label="Date">
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="2026-04-15"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </Field>

          <Field label="Start time">
            <TextInput
              style={styles.input}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="09:00"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </Field>

          <Field label="End time">
            <TextInput
              style={styles.input}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="10:00"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </Field>

          <Field label="Location (optional)">
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Bondi gym"
              placeholderTextColor={colors.textTertiary}
              maxLength={200}
            />
          </Field>

          <Field label="Notes (optional)">
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything your partner should know…"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={500}
            />
          </Field>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.timezoneHint}>Times are in your local timezone.</Text>

          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
              pressed && canSubmit && styles.pressed,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Send proposal"
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.submitButtonText}>Send proposal</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
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
  form: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  timezoneHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  submitButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitButtonDisabled: {
    backgroundColor: colors.border,
  },
  submitButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  pressed: { opacity: 0.65 },
});
