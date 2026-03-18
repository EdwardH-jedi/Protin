import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { colors, radii, spacing, typography } from '../../theme';
import type { AuthEntryScreenProps } from '../../navigation/types';

/**
 * Entry point for unauthenticated users.
 *
 * Two actions only: get started (new user) or log in (returning user).
 * Auth agent will wire the login button to a LoginScreen.
 * For now both paths lead to Onboarding as a placeholder.
 */
export function AuthEntryScreen({ navigation }: AuthEntryScreenProps) {
  return (
    <Screen padded>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Gym & Golf · Sydney</Text>
        <Text style={styles.headline}>Find your{'\n'}workout partner.</Text>
        <Text style={styles.subtext}>
          Connect with like-minded gym and golf{'\n'}partners in your city.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.buttonPrimary, pressed && styles.pressed]}
          onPress={() => navigation.navigate('RegisterScreen')}
          accessibilityRole="button"
          accessibilityLabel="Get started"
        >
          <Text style={styles.buttonPrimaryText}>Get started</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.buttonGhost, pressed && styles.pressed]}
          onPress={() => navigation.navigate('LoginScreen')}
          accessibilityRole="button"
          accessibilityLabel="Log in"
        >
          <Text style={styles.buttonGhostText}>Log in</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xxl,
  },
  eyebrow: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.md,
  },
  headline: {
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 48,
    letterSpacing: -1.5,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  subtext: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
  },
  actions: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  buttonPrimary: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonPrimaryText: {
    ...typography.button,
    color: colors.textInverse,
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonGhostText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.65,
  },
});
