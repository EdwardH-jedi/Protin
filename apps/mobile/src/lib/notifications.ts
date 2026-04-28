/**
 * Push notification registration using Expo Notifications.
 *
 * Call registerForPushNotifications() once on app startup (after auth).
 * On success it registers the Expo push token with the Protin API.
 *
 * The function is safe to call multiple times — the API upserts tokens.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

export async function registerForPushNotifications(): Promise<void> {
  // Permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    // User declined — do not treat as an error, just skip
    return;
  }

  let expoPushToken: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync();
    expoPushToken = result.data;
  } catch {
    // Can fail in simulators without push credentials — skip silently
    return;
  }

  const platform: 'ios' | 'android' | 'web' =
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

  try {
    await api.post('/notifications/token', { token: expoPushToken, platform });
  } catch {
    // Registration failure should not crash the app
  }
}

/**
 * Configure how notifications are displayed when the app is in the foreground.
 * Call once at app root level.
 */
export function configureForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      
    }),
  });
}
