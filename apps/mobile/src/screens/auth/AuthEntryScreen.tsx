import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../../theme';
import type { AuthEntryScreenProps } from '../../navigation/types';

/**
 * MoveMate Welcome / Auth entry.
 *
 * Visual direction translated from references/movemate_web_export
 * WelcomeScreen.tsx:
 *  - deep-navy hero block as the dominant surface
 *  - lowercase wordmark sits on the hero
 *  - white pill primary CTA + ghost CTA stack at the bottom of the hero
 *
 * Translated entirely with React Native primitives — no Tailwind /
 * Radix / DOM tags from the web export.
 */
export function AuthEntryScreen({ navigation }: AuthEntryScreenProps) {
  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        {/* Layered overlay so the hero reads as a soft top→bottom darken,
            without needing a gradient library. */}
        <View style={styles.heroOverlayTop} />
        <View style={styles.heroOverlayBottom} />

        <View style={styles.heroContent}>
          <View style={styles.brandBlock}>
            <Text style={styles.wordmark}>movemate</Text>
            <Text style={styles.eyebrow}>Gym & Golf · Sydney</Text>
          </View>

          <View style={styles.headlineBlock}>
            <Text style={styles.headline}>Find your</Text>
            <Text style={styles.headline}>workout partner.</Text>
            <Text style={styles.tagline}>
              Match by sport, level, and schedule. Train together, not just talk.
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.ctaPrimary, pressed && styles.ctaPrimaryPressed]}
              onPress={() => navigation.navigate('RegisterScreen')}
              accessibilityRole="button"
              accessibilityLabel="Get started"
            >
              <Text style={styles.ctaPrimaryText}>Get started</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.ctaGhost, pressed && styles.ctaGhostPressed]}
              onPress={() => navigation.navigate('LoginScreen')}
              accessibilityRole="button"
              accessibilityLabel="Log in"
            >
              <Text style={styles.ctaGhostText}>Log in</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brandDarkest,
  },
  hero: {
    flex: 1,
    backgroundColor: colors.brandDark,
    overflow: 'hidden',
  },
  heroOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: colors.brandDarkest,
    opacity: 0.6,
  },
  heroOverlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: colors.brandDarkest,
    opacity: 0.85,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: spacing.xxxl + spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  brandBlock: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  wordmark: {
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.5,
    color: colors.textInverse,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brandSoft,
  },
  headlineBlock: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  headline: {
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 46,
    letterSpacing: -1.5,
    color: colors.textInverse,
    textAlign: 'center',
  },
  tagline: {
    ...typography.bodyLarge,
    color: colors.brandSoft,
    textAlign: 'center',
    paddingTop: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
  ctaPrimary: {
    backgroundColor: colors.textInverse,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  ctaPrimaryPressed: {
    backgroundColor: colors.brandSoft,
  },
  ctaPrimaryText: {
    ...typography.button,
    color: colors.brand,
    fontSize: 17,
  },
  ctaGhost: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  ctaGhostPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  ctaGhostText: {
    ...typography.button,
    color: colors.textInverse,
  },
});
