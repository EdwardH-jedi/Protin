import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { colors, radii, spacing, typography } from '../../theme';
import type { SafetyCenterScreenProps } from '../../navigation/types';

/**
 * Safety Center — informational explainer for reports, blocking, and
 * community rules. Copy is deliberately truthful:
 *   - Block scope is "restricted from supported interactions".
 *   - No claim of chat blocking (not implemented in this stream).
 *   - No AI moderation or instant enforcement claims.
 *   - No verified-identity claim.
 */
export function SafetyCenterScreen({ navigation }: SafetyCenterScreenProps) {
  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Safety Center</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.intro}>
          <Text style={styles.title}>Safety Center</Text>
          <Text style={styles.lead}>
            How reports, blocking, and community rules work on SportsGang.
          </Text>
        </View>

        <Section title="Report a problem">
          <Text style={styles.body}>
            Report unsafe, fraudulent, or unreliable behavior.
          </Text>
          <Text style={styles.body}>
            We'll review reports and take action when appropriate.
          </Text>
        </Section>

        <Section title="Blocking">
          <Text style={styles.body}>
            Blocked users are restricted from supported interactions such as
            joining your games where supported.
          </Text>
          <Pressable
            onPress={() => navigation.navigate('BlockedUsers')}
            accessibilityRole="button"
            accessibilityLabel="Manage blocked users"
            style={({ pressed }) => [
              styles.manageButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.manageButtonText}>
              Manage blocked users
            </Text>
            <Text style={styles.manageButtonSub}>
              Manage people you've blocked.
            </Text>
          </Pressable>
        </Section>

        <Section title="No-show policy">
          <Text style={styles.body}>Only join games you can attend.</Text>
          <Text style={styles.body}>
            If plans change, leave before the game when possible.
          </Text>
          <Text style={styles.body}>
            Repeated no-shows may lower Honor.
          </Text>
        </Section>

        <Section title="Event safety tips">
          <Text style={styles.body}>Meet in public sports venues.</Text>
          <Text style={styles.body}>Check event details before joining.</Text>
          <Text style={styles.body}>
            Trust your instincts and report unsafe behavior.
          </Text>
        </Section>

        <Section title="Community rules">
          <Text style={styles.body}>Be respectful.</Text>
          <Text style={styles.body}>
            Do not harass, scam, or impersonate others.
          </Text>
          <Text style={styles.body}>
            Keep games safe, fair, and sports-first.
          </Text>
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section} accessibilityLabel={`Section ${title}`}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  backText: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 32 },
  scroll: {
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  intro: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  lead: {
    ...typography.body,
    color: colors.textSecondary,
  },
  section: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  sectionBody: {
    gap: spacing.xs,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
  manageButton: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: 'transparent',
  },
  manageButtonText: {
    ...typography.button,
    color: colors.brand,
  },
  manageButtonSub: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: 2,
  },
  pressed: { opacity: 0.65 },
});
