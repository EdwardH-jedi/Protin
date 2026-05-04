import { Alert, Linking } from 'react-native';

/**
 * Privacy Policy / Terms of Service / Support URLs.
 *
 * These point at hosted public pages and are read from Expo public env at
 * build time. We do not keep any hardcoded fallback because broken
 * fallbacks would silently send users to 404 pages (and Apple would
 * reject the listing).
 *
 * Builds without the env vars set — local dev, internal Expo Go — get
 * `null` here. `openLegal` then surfaces a user-friendly Alert instead
 * of opening a broken link.
 *
 * Production / store builds MUST ship with these env vars set:
 *   EXPO_PUBLIC_PRIVACY_URL
 *   EXPO_PUBLIC_TERMS_URL
 *   EXPO_PUBLIC_SUPPORT_URL
 */
export const PRIVACY_URL: string | null =
  process.env.EXPO_PUBLIC_PRIVACY_URL ?? null;

export const TERMS_URL: string | null =
  process.env.EXPO_PUBLIC_TERMS_URL ?? null;

export const SUPPORT_URL: string | null =
  process.env.EXPO_PUBLIC_SUPPORT_URL ?? null;

export const LEGAL_LINKS_CONFIGURED: boolean =
  PRIVACY_URL !== null && TERMS_URL !== null;

function isPlausibleHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+/i.test(value);
}

/**
 * Open a legal/support URL or, if it has not been configured for this
 * build (or is malformed), show a small Alert. Used by RegisterScreen
 * and ProfileScreen so neither has to repeat the unconfigured-build
 * branch. Linking failures are swallowed so a misbehaving native module
 * never crashes the screen.
 */
export function openLegal(url: string | null, label: string): void {
  if (!url || !isPlausibleHttpUrl(url)) {
    Alert.alert(
      `${label} not available`,
      'This link is not available yet. Please contact support.'
    );
    return;
  }
  void Linking.openURL(url).catch(() => {
    Alert.alert(
      `${label} not available`,
      'This link is not available yet. Please contact support.'
    );
  });
}
