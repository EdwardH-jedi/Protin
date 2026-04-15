// Dynamic Expo config — reads environment variables at build/start time.
// This replaces static app.json for any value that differs between
// local dev and staging.  Static metadata (name, slug, version, etc.)
// is kept here too so the file is the single source of truth.

/**
 * Resolve the API URL for the current build.
 *
 * Dev / staging builds may fall back to http://localhost:8000 for convenience.
 * Production builds MUST ship with a real HTTPS EXPO_PUBLIC_API_URL —
 * otherwise the bundled IPA can't talk to the server and App Store review
 * would reject it for plaintext networking. We throw at config-eval time
 * so the mistake surfaces during `eas build` rather than at runtime.
 */
function resolveApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  const isProduction = process.env.APP_ENV === "production";

  if (isProduction) {
    if (!configured) {
      throw new Error(
        "EXPO_PUBLIC_API_URL must be set for production builds (APP_ENV=production)."
      );
    }
    if (!configured.startsWith("https://")) {
      throw new Error(
        `EXPO_PUBLIC_API_URL must use https:// in production builds. Got: ${configured}`
      );
    }
    return configured;
  }

  return configured ?? "http://localhost:8000";
}

export default () => ({
  expo: {
    name: "Protin",
    slug: "protin",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    splash: {
      backgroundColor: "#102A43",
      resizeMode: "contain",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      bundleIdentifier: "com.edh1223.protin",
      buildNumber: "1",
      supportsTablet: false,
      infoPlist: {
        NSCalendarsUsageDescription:
          "Protin uses your calendar to add confirmed workout sessions.",
        // Required because expo-notifications is declared in plugins and
        // relies on silent remote push delivery in the background.
        UIBackgroundModes: ["remote-notification"],
      },
    },
    android: {
      package: "com.edh1223.protin",
      permissions: [
        "READ_CALENDAR",
        "WRITE_CALENDAR",
        "RECEIVE_BOOT_COMPLETED",
        "SCHEDULE_EXACT_ALARM",
      ],
      googleServicesFile: "./google-services.json",
    },
    plugins: [
      [
        "expo-notifications",
        {
          icon: "./assets/notification-icon.png",
          color: "#102A43",
          sounds: [],
        },
      ],
      "expo-apple-authentication",
      "@sentry/react-native/expo",
    ],
    // extra values are accessible in the app via Constants.expoConfig.extra
    extra: {
      apiUrl: resolveApiUrl(),
      googleRedirectUri:
        process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ??
        "http://localhost:8000/users/me/google-calendar/callback",
    },
  },
});
