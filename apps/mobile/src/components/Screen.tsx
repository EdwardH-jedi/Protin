import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Wrap content in a ScrollView. Useful for forms and long lists of static content.
   * For virtualized lists (FlatList etc.), leave false and manage scroll yourself.
   */
  scroll?: boolean;
  /** Apply standard horizontal padding from the design system. Default: true. */
  padded?: boolean;
  /** Shift content up when the keyboard appears. Useful for forms. */
  withKeyboard?: boolean;
};

export function Screen({
  children,
  style,
  scroll = false,
  padded = true,
  withKeyboard = false,
}: Props) {
  const insets = useSafeAreaInsets();

  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        padded && styles.padded,
        { paddingBottom: insets.bottom + spacing.xl },
        style,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padded && styles.padded, style]}>
      {children}
    </View>
  );

  const body = withKeyboard ? (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {inner}
    </KeyboardAvoidingView>
  ) : inner;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top },
      ]}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
});
