import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { useProfileStore, SportProfile } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingStep3'>;

type Level = 'beginner' | 'intermediate' | 'advanced';
type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'flexible';

const LEVELS: { value: Level; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const TIME_SLOTS: { value: TimeSlot; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'flexible', label: 'Flexible' },
];

interface SportFormState {
  level: Level;
  times: TimeSlot[];
  venueName: string;
}

const DEFAULT_SPORT_STATE: SportFormState = {
  level: 'beginner',
  times: [],
  venueName: '',
};

export function OnboardingStep3Screen({ navigation }: Props) {
  const [gymSelected, setGymSelected] = useState(false);
  const [golfSelected, setGolfSelected] = useState(false);
  const [gymState, setGymState] = useState<SportFormState>({ ...DEFAULT_SPORT_STATE });
  const [golfState, setGolfState] = useState<SportFormState>({ ...DEFAULT_SPORT_STATE });
  const [goals, setGoals] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { upsertSportProfile } = useProfileStore();

  function toggleSportTime(
    sport: 'gym' | 'golf',
    time: TimeSlot
  ) {
    const setter = sport === 'gym' ? setGymState : setGolfState;
    setter((prev) => ({
      ...prev,
      times: prev.times.includes(time)
        ? prev.times.filter((t) => t !== time)
        : [...prev.times, time],
    }));
  }

  function setLevel(sport: 'gym' | 'golf', level: Level) {
    const setter = sport === 'gym' ? setGymState : setGolfState;
    setter((prev) => ({ ...prev, level }));
  }

  function setVenueName(sport: 'gym' | 'golf', name: string) {
    const setter = sport === 'gym' ? setGymState : setGolfState;
    setter((prev) => ({ ...prev, venueName: name }));
  }

  async function handleFinish() {
    setError(null);
    if (!gymSelected && !golfSelected) {
      setError('Please select at least one sport.');
      return;
    }
    setIsSubmitting(true);
    try {
      const goalsValue = goals.trim() || undefined;
      const saves: Promise<void>[] = [];
      if (gymSelected) {
        const gymProfile: SportProfile = {
          sport: 'gym',
          level: gymState.level,
          preferredTimes: gymState.times,
          gymName: gymState.venueName.trim() || undefined,
          goals: goalsValue,
        };
        saves.push(upsertSportProfile(gymProfile));
      }
      if (golfSelected) {
        const golfProfile: SportProfile = {
          sport: 'golf',
          level: golfState.level,
          preferredTimes: golfState.times,
          golfClub: golfState.venueName.trim() || undefined,
          goals: goalsValue,
        };
        saves.push(upsertSportProfile(golfProfile));
      }
      await Promise.all(saves);
      navigation.replace('Main');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save sport profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen padded scroll>
      {/* Progress indicator */}
      <View style={styles.progress}>
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotActive]} />
        <Text style={styles.stepLabel}>Step 3 of 3</Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Sport profile</Text>
        <Text style={styles.title}>Your sport{'\n'}profile</Text>
        <Text style={styles.subtitle}>Tell us what you train, so we can match you better.</Text>
      </View>

      {/* Sport selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Which sports are you into?</Text>
        <View style={styles.toggleRow}>
          <Pressable
            style={({ pressed }) => [
              styles.toggleButton,
              gymSelected && styles.toggleButtonActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setGymSelected((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityLabel="Gym"
            accessibilityState={{ checked: gymSelected }}
          >
            <Text style={[styles.toggleButtonText, gymSelected && styles.toggleButtonTextActive]}>
              Gym
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.toggleButton,
              golfSelected && styles.toggleButtonActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setGolfSelected((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityLabel="Golf"
            accessibilityState={{ checked: golfSelected }}
          >
            <Text style={[styles.toggleButtonText, golfSelected && styles.toggleButtonTextActive]}>
              Golf
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Gym section */}
      {gymSelected && (
        <View style={styles.sportBlock}>
          <Text style={styles.sportBlockTitle}>Gym</Text>
          <SportFields
            sport="gym"
            state={gymState}
            venuePlaceholder="e.g. Fitness First Surry Hills"
            venueLabel="Gym name (optional)"
            onLevelChange={(l) => setLevel('gym', l)}
            onTimeToggle={(t) => toggleSportTime('gym', t)}
            onVenueChange={(n) => setVenueName('gym', n)}
          />
        </View>
      )}

      {/* Divider between sports */}
      {gymSelected && golfSelected && <View style={styles.divider} />}

      {/* Golf section */}
      {golfSelected && (
        <View style={styles.sportBlock}>
          <Text style={styles.sportBlockTitle}>Golf</Text>
          <SportFields
            sport="golf"
            state={golfState}
            venuePlaceholder="e.g. Royal Sydney Golf Club"
            venueLabel="Golf club (optional)"
            onLevelChange={(l) => setLevel('golf', l)}
            onTimeToggle={(t) => toggleSportTime('golf', t)}
            onVenueChange={(n) => setVenueName('golf', n)}
          />
        </View>
      )}

      {/* Goals */}
      {(gymSelected || golfSelected) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fitness goals (optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={goals}
            onChangeText={(t) => setGoals(t.slice(0, 300))}
            placeholder="What are your fitness goals?"
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{goals.length} / 300</Text>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.buttonPrimary,
          (pressed || isSubmitting) && styles.pressed,
        ]}
        onPress={handleFinish}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="Let's go"
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.buttonPrimaryText}>Let's go</Text>
        )}
      </Pressable>
    </Screen>
  );
}

// ─── Inline sub-component ─────────────────────────────────────────────────────

interface SportFieldsProps {
  sport: 'gym' | 'golf';
  state: SportFormState;
  venuePlaceholder: string;
  venueLabel: string;
  onLevelChange: (l: Level) => void;
  onTimeToggle: (t: TimeSlot) => void;
  onVenueChange: (n: string) => void;
}

function SportFields({
  state,
  venuePlaceholder,
  venueLabel,
  onLevelChange,
  onTimeToggle,
  onVenueChange,
}: SportFieldsProps) {
  return (
    <View style={styles.sportFieldsContainer}>
      {/* Level */}
      <View style={styles.subSection}>
        <Text style={styles.subSectionTitle}>Level</Text>
        <View style={styles.toggleRow}>
          {LEVELS.map((lv) => {
            const isSelected = state.level === lv.value;
            return (
              <Pressable
                key={lv.value}
                style={({ pressed }) => [
                  styles.toggleButton,
                  isSelected && styles.toggleButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => onLevelChange(lv.value)}
                accessibilityRole="radio"
                accessibilityLabel={lv.label}
                accessibilityState={{ checked: isSelected }}
              >
                <Text style={[styles.toggleButtonText, isSelected && styles.toggleButtonTextActive]}>
                  {lv.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Preferred times */}
      <View style={styles.subSection}>
        <Text style={styles.subSectionTitle}>Preferred times</Text>
        <View style={styles.toggleRow}>
          {TIME_SLOTS.map(({ value, label }) => {
            const isSelected = state.times.includes(value);
            return (
              <Pressable
                key={value}
                style={({ pressed }) => [
                  styles.toggleButton,
                  isSelected && styles.toggleButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => onTimeToggle(value)}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: isSelected }}
              >
                <Text style={[styles.toggleButtonText, isSelected && styles.toggleButtonTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Venue */}
      <View style={styles.subSection}>
        <Text style={styles.subSectionTitle}>{venueLabel}</Text>
        <TextInput
          style={styles.input}
          value={state.venueName}
          onChangeText={onVenueChange}
          placeholder={venuePlaceholder}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="words"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 20,
  },
  stepLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginLeft: spacing.xs,
  },
  header: {
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  toggleButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  toggleButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  toggleButtonText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  toggleButtonTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  sportBlock: {
    marginBottom: spacing.lg,
  },
  sportBlockTitle: {
    ...typography.h3,
    color: colors.brand,
    marginBottom: spacing.md,
  },
  sportFieldsContainer: {
    gap: spacing.md,
  },
  subSection: {
    gap: spacing.sm,
  },
  subSectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.separator,
    marginVertical: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.bodyLarge,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inputMultiline: {
    height: 80,
    paddingTop: spacing.md,
  },
  charCount: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'right',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    marginBottom: spacing.md,
  },
  buttonPrimary: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  buttonPrimaryText: {
    ...typography.button,
    color: colors.textInverse,
  },
  pressed: {
    opacity: 0.65,
  },
});
