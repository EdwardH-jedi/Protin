/**
 * SportsGang design tokens.
 *
 * Visual direction: electric neon-lime accent on a near-black surface.
 * Lime is the brand mark; black + dark elevation are the canvas.
 *
 *   background        — near-black, the base canvas under every Screen
 *   surface           — slightly lighter than background for cards / chrome
 *   surfaceElevated   — one step brighter for raised content (banner gutter)
 *   text*             — off-white ramp; tertiary still readable on dark
 *   textInverse       — near-black, used as text color on lime brand fills
 *   brand             — electric lime, the headline accent
 *   brandDark*        — deeper / darker lime + pure black for hero gradients
 *   brandSoft         — translucent lime tint, used for badges / soft fills
 *   accent            — slightly brighter lime for hover / pressed
 *   error / success   — tuned for legibility on dark surfaces
 *
 * Token *names* are kept stable so existing screens compile without touching
 * unrelated files. The single load-bearing flip is `textInverse` (white →
 * near-black) so that text on the lime brand fill reads correctly. The few
 * places that need light text on a hardcoded dark surface (image overlay /
 * remove-photo dot) override the color locally.
 */

export const colors = {
  // Backgrounds
  background: '#0A0A0A',
  surface: '#111114',
  surfaceElevated: '#16161B',

  // Text
  textPrimary: '#F5F5F0',   // off-white
  textSecondary: '#A8A8A2', // muted body
  textTertiary: '#6E6E68',  // hints, placeholders
  textInverse: '#0A0A0A',   // text on lime brand fills

  // Brand — electric lime family
  brand: '#C6FF3D',         // electric lime, primary CTA + accent
  brandDark: '#9CCC1F',     // deeper lime, pressed state
  brandDarkest: '#000000',  // pure black, hero base
  brandSoft: 'rgba(198,255,61,0.14)', // translucent lime tint for badges
  accent: '#DBFF66',        // brighter lime, hover/active

  // UI chrome
  border: '#26262B',
  separator: '#1B1B20',
  overlay: 'rgba(0, 0, 0, 0.65)',
  inputBackground: '#15151A',

  // Feedback
  error: '#FF5C5C',
  success: '#5BFF8B',
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
