// Dynamic Expo config — reads environment variables at build/start time.
// This replaces static app.json for any value that differs between
// local dev and staging.  Static metadata (name, slug, version, etc.)
// is kept here too so the file is the single source of truth.

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
      infoPlist: {
        NSCalendarsUsageDescription:
          "Protin uses your calendar to add confirmed workout sessions.",
      },
    },
    android: {
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
    ],
    // extra values are accessible in the app via Constants.expoConfig.extra
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000",
      googleRedirectUri:
        process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ??
        "http://localhost:8000/users/me/google-calendar/callback",
    },
  },
});
