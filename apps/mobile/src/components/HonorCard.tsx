import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import type { HonorLevel, HonorSummary, SportLevelSummary } from '../lib/rank';

interface HonorCardProps {
  summary: HonorSummary | null;
  isLoading?: boolean;
  error?: string | null;
}

const HONOR_LEVEL_ACCENTS: Record<HonorLevel, string> = {
  Rookie: colors.textTertiary,
  Regular: colors.textSecondary,
  Trusted: colors.brand,
  Captain: colors.brand,
  Legend: colors.accent,
};

/**
 * Honor / Gang Score / Sport Level card for the Profile / Me surface.
 *
 * Copy is deliberately specific:
 *   - "Honor reflects attendance, fair play, and reliable hosting."
 *   - "Gang Score reflects your activity and contribution."
 *
 * Never describe Honor as popularity; never claim AI moderation or
 * instant enforcement. Reports / blocks are not surfaced here.
 */
export function HonorCard({ summary, isLoading = false, error }: HonorCardProps) {
  if (isLoading && !summary) {
    return (
      <View style={styles.card} accessibilityLabel="Honor card loading">
        <Text style={styles.title}>Honor</Text>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  if (error && !summary) {
    return (
      <View style={styles.card} accessibilityLabel="Honor card error">
        <Text style={styles.title}>Honor</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={styles.card} accessibilityLabel="Honor card empty">
        <Text style={styles.title}>Honor</Text>
        <Text style={styles.bodyMuted}>
          Play your first game to start building your Honor.
        </Text>
      </View>
    );
  }

  const levelColor =
    HONOR_LEVEL_ACCENTS[summary.honorLevel] ?? colors.textSecondary;

  return (
    <View style={styles.card} accessibilityLabel="Honor card">
      <Text style={styles.title}>Honor</Text>

      <View style={styles.row}>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreLabel}>HONOR</Text>
          <Text style={styles.scoreValue}>{summary.honorScore}</Text>
          <Text style={[styles.levelText, { color: levelColor }]}>
            {summary.honorLevel}
          </Text>
        </View>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreLabel}>GANG SCORE</Text>
          <Text style={styles.scoreValue}>{summary.gangScore}</Text>
          <Text style={styles.scoreFootnote}>Activity · contribution</Text>
        </View>
      </View>

      <Text style={styles.bodyCopy}>
        Honor reflects attendance, fair play, and reliable hosting.
      </Text>
      <Text style={styles.bodyCopy}>
        Gang Score reflects your activity and contribution.
      </Text>

      <View style={styles.statsGrid}>
        <Stat label="Completed games" value={summary.completedGamesCount} />
        <Stat label="Hosted games" value={summary.hostedGamesCount} />
        <Stat label="No-shows" value={summary.noShowCount} />
      </View>

      {summary.sportLevels.length > 0 ? (
        <View style={styles.sportsBlock}>
          <Text style={styles.sectionLabel}>Sport levels</Text>
          {summary.sportLevels.map((s: SportLevelSummary) => (
            <View key={s.sport} style={styles.sportRow}>
              <Text style={styles.sportName}>{capitalize(s.sport)}</Text>
              <Text style={styles.sportLevel}>
                Lv {s.level} · {s.xp} XP
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCell} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  centered: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  scoreBlock: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: 2,
  },
  scoreLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  scoreValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  levelText: {
    ...typography.button,
    fontSize: 14,
  },
  scoreFootnote: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  bodyCopy: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  bodyMuted: {
    ...typography.body,
    color: colors.textSecondary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statCell: {
    flexGrow: 1,
    minWidth: '30%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  sportsBlock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  sportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  sportName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  sportLevel: {
    ...typography.body,
    color: colors.brand,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
});
