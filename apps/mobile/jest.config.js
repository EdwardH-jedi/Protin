/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Pre-test mocks for the SDK 53+ Expo "winter" runtime — must run before
  // any test imports `expo-*`, otherwise TurboModules trip an Invariant.
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|@sentry/.*|native-base|react-native-svg)',
  ],
  testMatch: ['<rootDir>/src/__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}'],
};
