import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import {
  BATTLE_SPORTS,
  SPORT_CAPACITY_DEFAULTS,
  createEvent,
  type EventMode,
} from '../../lib/events';
import { colors, radii, spacing, typography } from '../../theme';
import type { CreateBattleScreenProps } from '../../navigation/types';

const MODE_OPTIONS: { value: EventMode; label: string; sub: string }[] = [
  { value: 'casual', label: 'Casual Game', sub: 'Just play. No Honor risk.' },
  { value: 'ranked', label: 'Ranked Battle', sub: 'Counts toward Rank.' },
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function defaultDate(): string {
  // Tomorrow, ISO yyyy-mm-dd
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultTime(): string {
  return '18:00';
}

function combineLocalDateTime(dateStr: string, timeStr: string): Date | null {
  // dateStr=YYYY-MM-DD, timeStr=HH:MM. Built as local time so the user's
  // intent ("Sat 6pm") survives whatever timezone the device is in.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!m || !t) return null;
  const [, y, mo, da] = m;
  const [, hh, mm] = t;
  const d = new Date(
    Number(y),
    Number(mo) - 1,
    Number(da),
    Number(hh),
    Number(mm),
    0,
    0
  );
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function CreateBattleScreen({ navigation }: CreateBattleScreenProps) {
  const [mode, setMode] = useState<EventMode>('casual');
  const [sport, setSport] = useState<string>(BATTLE_SPORTS[0].value);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState(defaultTime());
  const [location, setLocation] = useState('');
  const [capacityInput, setCapacityInput] = useState<string>(
    String(SPORT_CAPACITY_DEFAULTS[BATTLE_SPORTS[0].value] ?? 10)
  );
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSelectSport = (s: string) => {
    setSport(s);
    setCapacityInput(String(SPORT_CAPACITY_DEFAULTS[s] ?? 10));
  };

  const capacity = useMemo(() => {
    const n = Number.parseInt(capacityInput, 10);
    return Number.isFinite(n) ? n : 0;
  }, [capacityInput]);

  const canSubmit =
    title.trim().length > 0 &&
    location.trim().length > 0 &&
    capacity >= 1 &&
    !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const startsAtDate = combineLocalDateTime(date, time);
    if (!startsAtDate) {
      Alert.alert(
        'Check date and time',
        'Use YYYY-MM-DD for the date and HH:MM (24h) for the time.'
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const detail = await createEvent({
        title: title.trim(),
        sport,
        mode,
        startsAt: startsAtDate.toISOString(),
        locationText: location.trim(),
        capacity,
        description: description.trim() ? description.trim() : null,
        visibility: 'public',
      });
      // Replace with detail so back button goes to the list, not back to
      // the empty form.
      navigation.replace('BattleDetail', { eventId: detail.id });
    } catch (err) {
      Alert.alert(
        "Couldn't create the game.",
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen padded={false} withKeyboard>
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
          <Text style={styles.headerTitle}>Host a game</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sub}>
          Set the details. Reliable hosts build higher Honor.
        </Text>

        {/* Mode */}
        <FieldLabel>Mode</FieldLabel>
        <View style={styles.modeRow}>
          {MODE_OPTIONS.map((opt) => {
            const active = opt.value === mode;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setMode(opt.value)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${opt.label}`}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.modeCard,
                  active && styles.modeCardActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.modeCardTitle,
                    active && styles.modeCardTitleActive,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.modeCardSub}>{opt.sub}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Sport */}
        <FieldLabel>Sport</FieldLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sportRow}
        >
          {BATTLE_SPORTS.map((s) => {
            const active = s.value === sport;
            return (
              <Pressable
                key={s.value}
                onPress={() => onSelectSport(s.value)}
                accessibilityRole="button"
                accessibilityLabel={`Select sport ${s.label}`}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Title */}
        <FieldLabel>Title</FieldLabel>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Sunday hoops at Bondi"
          placeholderTextColor={colors.textTertiary}
          maxLength={120}
          style={styles.input}
          accessibilityLabel="Game title"
        />

        {/* Date + time */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <FieldLabel>Date</FieldLabel>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              style={styles.input}
              accessibilityLabel="Game date"
            />
          </View>
          <View style={styles.rowItem}>
            <FieldLabel>Time</FieldLabel>
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="18:00"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              style={styles.input}
              accessibilityLabel="Game time"
            />
          </View>
        </View>

        {/* Location */}
        <FieldLabel>Location</FieldLabel>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Bondi Beach Court 2"
          placeholderTextColor={colors.textTertiary}
          maxLength={200}
          style={styles.input}
          accessibilityLabel="Game location"
        />

        {/* Capacity */}
        <FieldLabel>Capacity</FieldLabel>
        <TextInput
          value={capacityInput}
          onChangeText={(t) => setCapacityInput(t.replace(/[^0-9]/g, ''))}
          placeholder="10"
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          maxLength={3}
          style={styles.input}
          accessibilityLabel="Game capacity"
        />

        {/* Description */}
        <FieldLabel>Description (optional)</FieldLabel>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Bring your own water. Friendly run."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={1000}
          style={[styles.input, styles.inputMultiline]}
          accessibilityLabel="Game description"
        />

        <Text style={styles.visibilityNote}>
          Visibility: Public · Friends-only events are coming later.
        </Text>
      </ScrollView>

      <View style={styles.ctaBar}>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Create game"
          accessibilityState={{ disabled: !canSubmit }}
          style={({ pressed }) => [
            styles.cta,
            !canSubmit && styles.ctaDisabled,
            pressed && canSubmit && styles.pressed,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={[styles.ctaText, !canSubmit && styles.ctaTextDisabled]}>
              Create game
            </Text>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  sub: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  modeCardActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  modeCardTitle: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  modeCardTitleActive: {
    color: colors.brand,
  },
  modeCardSub: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  sportRow: {
    paddingRight: spacing.lg,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    ...typography.button,
    fontSize: 13,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
  },
  input: {
    backgroundColor: colors.inputBackground,
    color: colors.textPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowItem: { flex: 1 },
  visibilityNote: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: spacing.md,
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
  ctaDisabled: {
    backgroundColor: colors.border,
  },
  ctaText: {
    ...typography.button,
    color: colors.textInverse,
  },
  ctaTextDisabled: {
    color: colors.textTertiary,
  },
  pressed: { opacity: 0.65 },
});
