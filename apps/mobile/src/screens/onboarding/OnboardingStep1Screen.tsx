import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { Select, type SelectOption } from '../../components/Select';
import { SYDNEY_SUBURB_OPTIONS } from '../../data/sydneySuburbs';
import { useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingStep1'>;

const CURRENT_YEAR = new Date().getFullYear();
const MIN_AGE = 18;
const MAX_AGE = 90;
export const MAX_BIRTH_YEAR = CURRENT_YEAR - MIN_AGE;
export const MIN_BIRTH_YEAR = CURRENT_YEAR - MAX_AGE;
const BIO_MAX = 400;

export function buildYearOptions(): SelectOption[] {
  const years: SelectOption[] = [];
  // Most recent year first — most users tap near the top of the list.
  for (let y = MAX_BIRTH_YEAR; y >= MIN_BIRTH_YEAR; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

export function OnboardingStep1Screen({ navigation }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [birthYear, setBirthYear] = useState<string | null>(null);
  const [suburb, setSuburb] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { upsertProfile } = useProfileStore();

  const yearOptions = useMemo(buildYearOptions, []);

  const birthYearNum = birthYear ? parseInt(birthYear, 10) : null;
  const calculatedAge = birthYearNum ? CURRENT_YEAR - birthYearNum : null;

  async function handleContinue() {
    setError(null);
    if (!displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }
    if (!birthYearNum) {
      setError('Please select your birth year.');
      return;
    }
    if (!suburb) {
      setError('Please select your Sydney suburb.');
      return;
    }
    setIsSubmitting(true);
    try {
      await upsertProfile({
        displayName: displayName.trim(),
        birthYear: birthYearNum,
        suburb,
        bio: bio.trim() || undefined,
      });
      navigation.navigate('OnboardingStep2');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen padded scroll withKeyboard>
      <View style={styles.progress}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
        <Text style={styles.stepLabel}>Step 1 of 3</Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Getting started</Text>
        <Text style={styles.title}>Your profile</Text>
        <Text style={styles.subtitle}>Help potential partners know who you are.</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>
            Display name<Text style={styles.required}> *</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="How you'll appear to others"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Select
            label="Birth year"
            required
            value={birthYear}
            onChange={setBirthYear}
            placeholder="Select your birth year"
            options={yearOptions}
            modalTitle="Birth year"
            accessibilityLabel="Birth year"
          />
          {calculatedAge !== null ? (
            <Text style={styles.hint}>Age: {calculatedAge}</Text>
          ) : null}
        </View>

        <Select
          label="Your Sydney suburb"
          required
          value={suburb}
          onChange={setSuburb}
          placeholder="Select your suburb"
          options={SYDNEY_SUBURB_OPTIONS}
          searchable
          modalTitle="Sydney suburb"
          accessibilityLabel="Sydney suburb"
        />

        <View style={styles.field}>
          <Text style={styles.label}>Bio (optional)</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
            placeholder="Tell potential partners a bit about yourself..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{bio.length} / {BIO_MAX}</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.submit,
            (pressed || isSubmitting) && styles.submitPressed,
          ]}
          onPress={handleContinue}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.submitText}>Continue</Text>
          )}
        </Pressable>
      </View>
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
  form: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  required: {
    color: colors.error,
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
  bioInput: {
    height: 120,
    paddingTop: spacing.md,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  charCount: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'right',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  submit: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: spacing.sm,
  },
  submitPressed: {
    opacity: 0.65,
  },
  submitText: {
    ...typography.button,
    color: colors.textInverse,
  },
});
