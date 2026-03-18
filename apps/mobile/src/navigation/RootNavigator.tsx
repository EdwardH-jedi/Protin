import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { SplashScreen } from '../screens/SplashScreen';
import { AuthEntryScreen } from '../screens/auth/AuthEntryScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { OnboardingStep1Screen } from '../screens/onboarding/OnboardingStep1Screen';
import { OnboardingStep2Screen } from '../screens/onboarding/OnboardingStep2Screen';
import { OnboardingStep3Screen } from '../screens/onboarding/OnboardingStep3Screen';
import { DiscoveryScreen } from '../screens/discovery/DiscoveryScreen';
import { MatchesScreen } from '../screens/matches/MatchesScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { BookingComposerScreen } from '../screens/bookings/BookingComposerScreen';
import { BookingDetailScreen } from '../screens/bookings/BookingDetailScreen';
import { ReportScreen } from '../screens/safety/ReportScreen';

import { registerForPushNotifications, configureForegroundHandler } from '../lib/notifications';
import { useAuthStore } from '../stores/auth';
import { colors } from '../theme';
import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.separator,
          borderTopWidth: 1,
          // Remove platform shadows — let the border do the separation.
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 0.3,
          marginBottom: 2,
        },
        // Icon slot left intentionally empty at foundation stage.
        // Icon agent will add tab icons once the icon system is decided.
        tabBarShowIcon: false,
      }}
    >
      <Tab.Screen
        name="Discovery"
        component={DiscoveryScreen}
        options={{ title: 'Discover' }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        options={{ title: 'Matches' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { token } = useAuthStore();

  useEffect(() => {
    configureForegroundHandler();
  }, []);

  useEffect(() => {
    if (token) {
      registerForPushNotifications();
    }
  }, [token]);

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="AuthEntry" component={AuthEntryScreen} />
        <Stack.Screen
          name="LoginScreen"
          component={LoginScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="RegisterScreen"
          component={RegisterScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="OnboardingStep1"
          component={OnboardingStep1Screen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="OnboardingStep2"
          component={OnboardingStep2Screen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="OnboardingStep3"
          component={OnboardingStep3Screen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="BookingComposer"
          component={BookingComposerScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="BookingDetail"
          component={BookingDetailScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Report"
          component={ReportScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
