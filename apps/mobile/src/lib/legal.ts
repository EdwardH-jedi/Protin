import { Alert, Linking } from 'react-native';

/**
 * Privacy Policy / Terms of Service URLs.
 *
 * These point at hosted public pages and are read from Expo public env at
 * build time. We no longer keep a hardcoded protin.app fallback because
 * those URLs return 404, which would silently send users to broken pages
 * (and Apple would reject the listing).
 *
 * Builds without the env vars set — local dev, internal Expo Go — get
 * `null` here. `openLegal` then surfaces a clear "not configured" Alert
 * instead of opening a broken link.
 *
 * Production / store builds MUST ship with both env vars set:
 *   EXPO_PUBLIC_PRIVACY_URL
 *   EXPO_PUBLIC_TERMS_URL
 */
export const PRIVACY_URL: string | null =
  process.env.EXPO_PUBLIC_PRIVACY_URL ?? null;

export const TERMS_URL: string | null =
  process.env.EXPO_PUBLIC_TERMS_URL ?? null;

export const LEGAL_LINKS_CONFIGURED: boolean =
  PRIVACY_URL !== null && TERMS_URL !== null;

/**
 * Open a legal URL or, if it has not been configured for this build, show
 * a readable Alert explaining what's missing. Used by RegisterScreen and
 * ProfileScreen so neither has to repeat the unconfigured-build branch.
 */
export function openLegal(url: string | null, label: string): void {
  if (!url) {
    Alert.alert(
      `${label} not available`,
      `${label} is not configured for this build. ` +
        'Set EXPO_PUBLIC_PRIVACY_URL and EXPO_PUBLIC_TERMS_URL to the hosted URLs before public release.'
    );
    return;
  }
  void Linking.openURL(url);
}
