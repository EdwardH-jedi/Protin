import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuthStore } from '../stores/auth';
import { colors } from '../theme';
import type { SplashScreenProps } from '../navigation/types';

/**
 * In-app splash screen.
 *
 * Shows the wordmark on brand background for a deliberate beat while
 * rehydrating the auth token from secure storage. Navigates to Main
 * if a valid token is found, otherwise to AuthEntry.
 *
 * The native splash (app.json backgroundColor #102A43) matches this
 * background — no visible flash on launch.
 */
export function SplashScreen({ navigation }: SplashScreenProps) {
  useEffect(() => {
    let cancelled = false;

    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, 1100));
    const init = useAuthStore.getState().initialize();

    Promise.all([init, minDelay]).then(() => {
      if (cancelled) return;
      const { token } = useAuthStore.getState();
      navigation.replace(token ? 'Main' : 'AuthEntry');
    });

    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>PROTIN</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordmark: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textInverse,
    letterSpacing: 10,
  },
});
