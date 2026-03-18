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
import { useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingStep2'>;

const OPEN_TO_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'non_binary', label: 'Non-binary' },
];

const DISTANCE_OPTIONS = [5, 10, 20, 50];

export function OnboardingStep2Screen({ navigation }: Props) {
  const [openTo, setOpenTo] = useState<string[]>(['any']);
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('65');
  const [maxDistance, setMaxDistance] = useState<number>(20);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { upsertIdentityPreferences } = useProfileStore();

  function toggleOpenTo(value: string) {
    if (value === 'any') {
      setOpenTo(['any']);
      return;
    }
    setOpenTo((prev) => {
      const withoutAny = prev.filter((v) => v !== 'any');
      if (withoutAny.includes(value)) {
        const next = withoutAny.filter((v) => v !== value);
        return next.length === 0 ? ['any'] : next;
      }
      return [...withoutAny, value];
    });
  }

  async function handleContinue() {
    setError(null);
    const ageMinNum = parseInt(ageMin, 10);
    const ageMaxNum = parseInt(ageMax, 10);
    if (isNaN(ageMinNum) || isNaN(ageMaxNum) || ageMinNum < 18 || ageMaxNum > 65 || ageMinNum > ageMaxNum) {
      setError('Please enter a valid age range (18–65).');
      return;
    }
    setIsSubmitting(true);
    try {
      await upsertIdentityPreferences({
        openTo,
        ageRangeMin: ageMinNum,
        ageRangeMax: ageMaxNum,
        maxDistanceKm: maxDistance,
      });
      navigation.navigate('OnboardingStep3');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preferences. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen padded scroll>
      {/* Progress indicator */}
      <View style={styles.progress}>
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <Text style={styles.stepLabel}>Step 2 of 3</Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Preferences</Text>
        <Text style={styles.title}>Your partner{'\n'}preferences</Text>
        <Text style={styles.subtitle}>We use this to show you relevant workout partners.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>I'm open to training with</Text>
        <View style={styles.toggleRow}>
          {OPEN_TO_OPTIONS.map((opt) => {
            const isSelected = openTo.includes(opt.value);
            return (
              <Pressable
                key={opt.value}
                style={({ pressed }) => [
                  styles.toggleButton,
                  isSelected && styles.toggleButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => toggleOpenTo(opt.value)}
                accessibilityRole="checkbox"
                accessibilityLabel={opt.label}
                accessibilityState={{ checked: isSelected }}
              >
                <Text
                  style={[
                    styles.toggleButtonText,
                    isSelected && styles.toggleButtonTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Partner age range</Text>
        <View style={styles.ageRow}>
          <View style={styles.ageField}>
            <Text style={styles.label}>Min age</Text>
            <TextInput
              style={styles.ageInput}
              value={ageMin}
              onChangeText={setAgeMin}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="18"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <Text style={styles.ageSeparator}>–</Text>
          <View style={styles.ageField}>
            <Text style={styles.label}>Max age</Text>
            <TextInput
              style={styles.ageInput}
              value={ageMax}
              onChangeText={setAgeMax}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="65"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Max distance</Text>
        <View style={styles.toggleRow}>
          {DISTANCE_OPTIONS.map((km) => {
            const isSelected = maxDistance === km;
            return (
              <Pressable
                key={km}
                style={({ pressed }) => [
                  styles.toggleButton,
                  isSelected && styles.toggleButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => setMaxDistance(km)}
                accessibilityRole="radio"
                accessibilityLabel={`${km} km`}
                accessibilityState={{ checked: isSelected }}
              >
                <Text
                  style={[
                    styles.toggleButtonText,
                    isSelected && styles.toggleButtonTextActive,
                  ]}
                >
                  {km} km
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.buttonPrimary,
          (pressed || isSubmitting) && styles.pressed,
        ]}
        onPress={handleContinue}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="Continue"
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.buttonPrimaryText}>Continue</Text>
        )}
      </Pressable>
    </Screen>
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
  ageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  ageField: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  ageInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.bodyLarge,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    textAlign: 'center',
  },
  ageSeparator: {
    ...typography.h2,
    color: colors.textTertiary,
    paddingBottom: spacing.sm,
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
