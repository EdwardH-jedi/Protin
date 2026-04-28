import React from 'react';
import { render, act } from '@testing-library/react-native';

import { RootNavigator } from '../navigation/RootNavigator';

const mockUseAuthStore = jest.fn();
const mockConfigureForegroundHandler = jest.fn();
const mockRegisterForPushNotifications = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

jest.mock('../lib/notifications', () => ({
  configureForegroundHandler: () => mockConfigureForegroundHandler(),
  registerForPushNotifications: () => mockRegisterForPushNotifications(),
}));

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => {
      const { View } = require('react-native');
      return <View>{children}</View>;
    },
    Screen: () => null,
  }),
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => {
      const { View } = require('react-native');
      return <View>{children}</View>;
    },
    Screen: () => null,
  }),
}));

jest.mock('../screens/SplashScreen', () => ({ SplashScreen: () => null }));
jest.mock('../screens/auth/AuthEntryScreen', () => ({ AuthEntryScreen: () => null }));
jest.mock('../screens/auth/LoginScreen', () => ({ LoginScreen: () => null }));
jest.mock('../screens/auth/RegisterScreen', () => ({ RegisterScreen: () => null }));
jest.mock('../screens/onboarding/OnboardingStep1Screen', () => ({ OnboardingStep1Screen: () => null }));
jest.mock('../screens/onboarding/OnboardingStep2Screen', () => ({ OnboardingStep2Screen: () => null }));
jest.mock('../screens/onboarding/OnboardingStep3Screen', () => ({ OnboardingStep3Screen: () => null }));
jest.mock('../screens/onboarding/OnboardingStep4Screen', () => ({ OnboardingStep4Screen: () => null }));
jest.mock('../screens/discovery/DiscoveryScreen', () => ({ DiscoveryScreen: () => null }));
jest.mock('../screens/matches/MatchesScreen', () => ({ MatchesScreen: () => null }));
jest.mock('../screens/profile/ProfileScreen', () => ({ ProfileScreen: () => null }));
jest.mock('../screens/profile/EditProfileScreen', () => ({ EditProfileScreen: () => null }));
jest.mock('../screens/chat/ChatScreen', () => ({ ChatScreen: () => null }));
jest.mock('../screens/bookings/BookingComposerScreen', () => ({ BookingComposerScreen: () => null }));
jest.mock('../screens/bookings/BookingDetailScreen', () => ({ BookingDetailScreen: () => null }));
jest.mock('../screens/safety/ReportScreen', () => ({ ReportScreen: () => null }));

describe('RootNavigator auth-adjacent side effects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthStore.mockReturnValue({ token: null });
  });

  it('does not let notification handler setup failures block navigator render', () => {
    mockConfigureForegroundHandler.mockImplementation(() => {
      throw new Error('Notifications unavailable in Expo Go');
    });

    expect(() => render(<RootNavigator />)).not.toThrow();
    expect(mockConfigureForegroundHandler).toHaveBeenCalled();
  });

  it('does not surface push registration rejection after login/register sets a token', async () => {
    mockUseAuthStore.mockReturnValue({ token: 'jwt-token' });
    mockRegisterForPushNotifications.mockRejectedValue(
      new Error('Expo push notifications unavailable')
    );

    render(<RootNavigator />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRegisterForPushNotifications).toHaveBeenCalled();
  });
});
