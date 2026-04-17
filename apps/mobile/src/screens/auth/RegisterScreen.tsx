import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { PRIVACY_URL, TERMS_URL } from '../../lib/legal';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterScreen'>;

export function RegisterScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { register, isLoading } = useAuthStore();

  async function handleRegister() {
    setError(null);
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    try {
      await register(email.trim(), password);
      // New users always complete onboarding first
      navigation.replace('OnboardingStep1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    }
  }

  return (
    <Screen padded scroll withKeyboard>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Let's go</Text>
        <Text style={styles.title}>Create your{'\n'}account</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 8 characters"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.buttonPrimary,
            (pressed || isLoading) && styles.pressed,
          ]}
          onPress={handleRegister}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Create account"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonPrimaryText}>Create account</Text>
          )}
        </Pressable>

        <Text style={styles.legalText}>
          By creating an account you agree to our{' '}
          <Text
            style={styles.legalLink}
            accessibilityRole="link"
            onPress={() => Linking.openURL(TERMS_URL)}
          >
            Terms of Service
          </Text>
          {' '}and{' '}
          <Text
            style={styles.legalLink}
            accessibilityRole="link"
            onPress={() => Linking.openURL(PRIVACY_URL)}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => navigation.replace('LoginScreen')}
          accessibilityRole="button"
          accessibilityLabel="Log in"
        >
          <Text style={styles.footerText}>
            Already have an account?{' '}
            <Text style={styles.footerLink}>Log in</Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  eyebrow: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
  },
  form: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
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
  legalText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  legalLink: {
    color: colors.accent,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  footerLink: {
    color: colors.accent,
    fontWeight: '600',
  },
});
