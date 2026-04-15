import { useEffect } from 'react';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';

import { RootNavigator } from './src/navigation/RootNavigator';

// Crash reporting — guarded so dev builds without a DSN are a no-op.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Leave tracing off by default; the App Store launch only needs crash
    // reports, not performance spans.
    tracesSampleRate: 0,
  });
}

// Prevent the native splash from auto-hiding before the JS bundle is ready.
// hideAsync() is called inside the useEffect below once the component tree mounts.
ExpoSplashScreen.preventAutoHideAsync();

export default function App() {
  useEffect(() => {
    ExpoSplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      {/*
        StatusBar is set to 'auto' here as the global default.
        SplashScreen (dark background) may override this if needed —
        React Navigation handles per-screen focus events.
      */}
      <StatusBar style="dark" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
