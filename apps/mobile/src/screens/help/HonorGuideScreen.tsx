import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { colors, radii, spacing, typography } from '../../theme';
import type { HonorGuideScreenProps } from '../../navigation/types';

/**
 * Honor Guide — informational explainer for Honor / Gang Score /
 * Sport Levels. Copy is deliberately specific:
 *   - "Honor is not popularity."
 *   - "It reflects attendance, fair play, and reliable hosting."
 * Never describe Honor as a leaderboard, never claim AI moderation,
 * instant enforcement, or verified identity.
 */

const HONOR_LEVELS = [
  'Rookie',
  'Regular',
  'Trusted',
  'Captain',
  'Legend',
] as const;

export function HonorGuideScreen({ navigation }: HonorGuideScreenProps) {
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
          <Text style={styles.headerTitle}>Honor Guide</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.intro}>
          <Text style={styles.title}>Build your Honor</Text>
          <Text style={styles.leadStrong}>Honor is not popularity.</Text>
          <Text style={styles.lead}>
            It reflects attendance, fair play, and reliable hosting.
          </Text>
        </View>

        <Section title="Honor">
          <Text style={styles.body}>
            Honor reflects how reliable you are in the SportsGang community.
          </Text>
          <Text style={styles.body}>
            Showing up, playing fairly, and hosting responsibly help build trust.
          </Text>
        </Section>

        <Section title="Gang Score">
          <Text style={styles.body}>
            Gang Score reflects your activity and contribution.
          </Text>
          <Text style={styles.body}>
            Completing games and hosting reliable events can increase your Gang
            Score.
          </Text>
        </Section>

        <Section title="Sport Levels">
          <Text style={styles.body}>Each sport has its own level.</Text>
          <Text style={styles.body}>
            Sport Levels reflect experience in that sport, not overall
            popularity.
          </Text>
        </Section>

        <Section title="No-show policy">
          <Text style={styles.body}>Only join games you can attend.</Text>
          <Text style={styles.body}>No-shows can lower Honor.</Text>
          <Text style={styles.body}>
            Excused attendance does not lower Honor.
          </Text>
        </Section>

        <Section title="Reports and safety">
          <Text style={styles.body}>
            Reports help us review unsafe or unreliable behavior.
          </Text>
          <Text style={styles.body}>
            Reports do not automatically change someone's Honor.
          </Text>
          <Text style={styles.body}>
            Only reviewed actioned reports may affect Honor.
          </Text>
        </Section>

        <Section title="Honor levels">
          <View style={styles.levelList}>
            {HONOR_LEVELS.map((level) => (
              <View key={level} style={styles.levelPill}>
                <Text style={styles.levelPillText}>{level}</Text>
              </View>
            ))}
          </View>
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
  leadStrong: {
    ...typography.bodyLarge,
    color: colors.brand,
    fontWeight: '600',
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
  levelList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  levelPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  levelPillText: {
    ...typography.label,
    color: colors.textPrimary,
  },
  pressed: { opacity: 0.65 },
});
