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

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingStep1'>;

const CURRENT_YEAR = new Date().getFullYear();

export function OnboardingStep1Screen({ navigation }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [suburb, setSuburb] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { upsertProfile } = useProfileStore();

  const birthYearNum = birthYear ? parseInt(birthYear, 10) : undefined;
  const calculatedAge =
    birthYearNum && birthYearNum >= 1940 && birthYearNum <= 2005
      ? CURRENT_YEAR - birthYearNum
      : null;

  async function handleContinue() {
    setError(null);
    if (!displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }
    if (birthYear && (isNaN(Number(birthYear)) || birthYearNum! < 1940 || birthYearNum! > 2005)) {
      setError('Please enter a valid birth year between 1940 and 2005.');
      return;
    }
    setIsSubmitting(true);
    try {
      await upsertProfile({
        displayName: displayName.trim(),
        birthYear: birthYearNum,
        suburb: suburb.trim() || undefined,
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
      {/* Progress indicator */}
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
        {/* Display name */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Display name <Text style={styles.required}>*</Text>
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

        {/* Birth year */}
        <View style={styles.field}>
          <Text style={styles.label}>Birth year (optional)</Text>
          <TextInput
            style={styles.input}
            value={birthYear}
            onChangeText={setBirthYear}
            placeholder="e.g. 1990"
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            maxLength={4}
            returnKeyType="next"
          />
          {calculatedAge !== null && (
            <Text style={styles.hint}>Age: {calculatedAge}</Text>
          )}
        </View>

        {/* Suburb */}
        <View style={styles.field}>
          <Text style={styles.label}>Your Sydney suburb (optional)</Text>
          <TextInput
            style={styles.input}
            value={suburb}
            onChangeText={setSuburb}
            placeholder="e.g. Surry Hills"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        {/* Bio */}
        <View style={styles.field}>
          <Text style={styles.label}>Bio (optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={bio}
            onChangeText={(t) => setBio(t.slice(0, 400))}
            placeholder="Tell potential partners a bit about yourself..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{bio.length} / 400</Text>
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
  inputMultiline: {
    height: 100,
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
  buttonPrimary: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonPrimaryText: {
    ...typography.button,
    color: colors.textInverse,
  },
  pressed: {
    opacity: 0.65,
  },
});
