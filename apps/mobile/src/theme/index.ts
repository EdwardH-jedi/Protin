/**
 * Protin design tokens.
 *
 * Palette intention:
 *   background  — warm off-white, feels premium not clinical
 *   brand       — deep navy, authority without aggression
 *   accent      — warm amber, energy without neon loudness
 *   text*       — navy-based greys, not pure black, softer on screen
 */

export const colors = {
  // Backgrounds
  background: '#F6F4EE',
  surface: '#FFFFFF',
  surfaceElevated: '#FAFAF9',

  // Text
  textPrimary: '#102A43',
  textSecondary: '#486581',
  textTertiary: '#829AB1',
  textInverse: '#FFFFFF',

  // Brand
  brand: '#102A43',
  accent: '#B87333',   // copper-amber: premium, warm, distinct from generic orange

  // UI chrome
  border: '#D9D6CE',
  separator: '#EAE8E3',
  overlay: 'rgba(16, 42, 67, 0.5)',

  // Feedback
  error: '#C53030',
  success: '#276749',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/**
 * Typography scale.
 * All weights use system font stack (SF Pro / Roboto).
 * No external font dependency needed for the foundation.
 */
export const typography = {
  display: {
    fontSize: 42,
    fontWeight: '700' as const,
    lineHeight: 50,
    letterSpacing: -1.5,
    color: colors.textPrimary,
  },
  h1: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
    letterSpacing: -1,
    color: colors.textPrimary,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  bodyLarge: {
    fontSize: 17,
    fontWeight: '400' as const,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
    color: colors.textTertiary,
  },
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 16,
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
    color: colors.textSecondary,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
} as const;
