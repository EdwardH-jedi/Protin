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
      <View style={styles.progressBlock}>
        <View style={styles.progressBar}>
          <View style={[styles.progressSegment, styles.progressSegmentActive]} />
          <View style={styles.progressSegment} />
          <View style={styles.progressSegment} />
          <View style={styles.progressSegment} />
        </View>
        <Text style={styles.stepLabel}>Step 1 of 4</Text>
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
            // iOS-specific: declare this is a nickname/display-name field, NOT
            // a credential field. The previous version used "none", but on iOS
            // "none" means "no declared type → use heuristics". After the
            // RegisterScreen's newPassword field, iOS heuristics decide the
            // next text input is part of the same credential flow and engage
            // Strong Password Autofill — which paints the field background
            // yellow and captures keystrokes before they reach React, so
            // typed text never appears and the "Please enter a display name"
            // error fires on Continue. "nickname" is the unambiguous iOS
            // hint for a display-name field and breaks that association.
            textContentType="nickname"
            // Android-side belt-and-braces: keep system autofill off so the
            // OS cannot inject a value without firing onChangeText.
            autoComplete="off"
            importantForAutofill="no"
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
  progressBlock: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  progressBar: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.separator,
  },
  progressSegmentActive: {
    backgroundColor: colors.brand,
  },
  stepLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  header: {
    paddingBottom: spacing.xl,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
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
    gap: spacing.lg,
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
    // Use explicit fontSize/fontWeight from the bodyLarge token but omit
    // lineHeight: setting lineHeight on a TextInput clips descenders (g, y, p)
    // on Android and is unnecessary since TextInput is single-line here.
    fontSize: typography.bodyLarge.fontSize,
    fontWeight: typography.bodyLarge.fontWeight,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  submit: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: spacing.md,
  },
  submitPressed: {
    opacity: 0.65,
  },
  submitText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 17,
  },
});
