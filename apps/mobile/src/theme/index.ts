/**
 * MoveMate design tokens.
 *
 * Translated from references/movemate_web_export — visual direction only,
 * not the literal CSS variables (the export uses Tailwind/oklch which
 * doesn't translate to React Native).
 *
 * Visual direction:
 *   background  — clean white, mobile-app feel
 *   brand       — athletic blue (Tailwind blue-600), primary CTA + accent text
 *   brandDark*  — deep navy used in hero gradient on Welcome / AuthEntry
 *   accent      — slightly lighter blue, for active states
 *   text*       — neutral grey ramp (gray-900 → gray-400)
 *
 * Token *names* are kept stable so onboarding / profile / discovery screens
 * compile against the new values without code changes. New MoveMate-only
 * keys (brandDark, brandDarkest, brandSoft, inputBackground) are additive
 * and only consumed by the auth screens.
 */

export const colors = {
  // Backgrounds
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#F9FAFB',

  // Text
  textPrimary: '#0F172A',   // slate-900 — strong on white
  textSecondary: '#475569', // slate-600 — body copy
  textTertiary: '#94A3B8',  // slate-400 — hints, placeholders
  textInverse: '#FFFFFF',

  // Brand — MoveMate blue family
  brand: '#2563EB',         // blue-600 — primary CTAs, links
  brandDark: '#1E3A8A',     // blue-900 — hero gradient mid
  brandDarkest: '#172554',  // blue-950 — hero gradient base
  brandSoft: '#DBEAFE',     // blue-100 — light tint, supporting copy on dark
  accent: '#3B82F6',        // blue-500 — active/hover state on light surfaces

  // UI chrome
  border: '#E5E7EB',        // gray-200 — input + card edges
  separator: '#F1F5F9',     // slate-100 — soft list dividers
  overlay: 'rgba(15, 23, 42, 0.55)',
  inputBackground: '#F3F4F6', // gray-100 — matches reference --input-background

  // Feedback
  error: '#DC2626',         // red-600
  success: '#16A34A',       // green-600
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
  md: 12,
  lg: 18,
  xl: 24,
  pill: 9999,
  full: 9999,
} as const;

/**
 * Typography scale. System font (SF Pro / Roboto), no external font dep.
 */
export const typography = {
  display: {
    fontSize: 48,
    fontWeight: '700' as const,
    lineHeight: 54,
    letterSpacing: -1.8,
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
