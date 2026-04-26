import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Screen } from '../../components/Screen';
import { useAuthStore } from '../../stores/auth';
import { useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LoginScreen'>;

function generateNonce(): string {
  // 32 chars of url-safe entropy. The backend verifies by computing
  // SHA256(nonce) and comparing against the identityToken's nonce claim.
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return nonce;
}

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { login, loginWithApple, isLoading } = useAuthStore();

  async function routeAfterAuth() {
    // Mirror SplashScreen's onboarding gate so a returning user with a
    // missing/incomplete Step 1 lands in onboarding instead of Main with
    // a blank display name.
    try {
      await useProfileStore.getState().fetchProfile();
      const { profile } = useProfileStore.getState();
      const step1Complete =
        !!profile &&
        !!profile.displayName &&
        profile.displayName.trim().length > 0 &&
        !!profile.birthYear &&
        !!profile.suburb;
      navigation.replace(step1Complete ? 'Main' : 'OnboardingStep1');
    } catch {
      navigation.replace('OnboardingStep1');
    }
  }

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    try {
      await login(email.trim(), password);
      await routeAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    }
  }

  async function handleAppleSignIn() {
    setError(null);
    try {
      const nonce = generateNonce();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
      if (!credential.identityToken) {
        setError('Apple Sign-in did not return an identity token.');
        return;
      }
      const fullName = credential.fullName;
      const composedName = fullName
        ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ').trim() || null
        : null;
      await loginWithApple({
        identityToken: credential.identityToken,
        nonce,
        email: credential.email ?? null,
        name: composedName,
      });
      await routeAfterAuth();
    } catch (err) {
      // User canceling the sheet is not a real error — swallow silently.
      if (err && typeof err === 'object' && (err as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Apple Sign-in failed. Please try again.');
    }
  }

  return (
    <Screen padded scroll withKeyboard>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Welcome back</Text>
        <Text style={styles.title}>Log in</Text>
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
            placeholder="Your password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.buttonPrimary,
            (pressed || isLoading) && styles.pressed,
          ]}
          onPress={handleLogin}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Log in"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonPrimaryText}>Log in</Text>
          )}
        </Pressable>

        {Platform.OS === 'ios' ? (
          <View style={styles.appleSection}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radii.md}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => navigation.replace('RegisterScreen')}
          accessibilityRole="button"
          accessibilityLabel="Sign up"
        >
          <Text style={styles.footerText}>
            Don't have an account?{' '}
            <Text style={styles.footerLink}>Sign up</Text>
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
  appleSection: {
    marginTop: spacing.md,
  },
  appleButton: {
    width: '100%',
    height: 48,
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
