import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import type { HonorTitleRead, RankProfileRead } from '../lib/honorSystem';

interface LocalRankSectionProps {
  sport: string;
  area: string;
  rank: RankProfileRead | null;
  localChampion: HonorTitleRead | null;
  myTitles: HonorTitleRead[];
  isLoading?: boolean;
  error?: string | null;
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Read-only Local Rank / Honor section for the Profile screen.
 *
 * Surfaces:
 *   - caller's rating, wins/losses, current win streak for (sport, area)
 *   - any local champion titles the caller currently holds
 *
 * Empty-state copy is intentionally calm and does NOT promise users
 * they can submit results manually — the public Honor System API is
 * read-only and the only legitimate writer is a future verified
 * challenge / tournament / group-event result hook. Do not change this
 * copy to imply a manual-submission flow.
 */
export function LocalRankSection({
  sport,
  area,
  rank,
  localChampion,
  myTitles,
  isLoading = false,
  error,
}: LocalRankSectionProps) {
  const heading = `${capitalize(area)} ${capitalize(sport)} Rank`;
  const isUnranked =
    rank === null || (rank.wins === 0 && rank.losses === 0);

  if (isLoading && rank === null) {
    return (
      <View style={styles.card} accessibilityLabel="Local rank loading">
        <Text style={styles.title}>{heading}</Text>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  if (error && rank === null) {
    return (
      <View style={styles.card} accessibilityLabel="Local rank error">
        <Text style={styles.title}>{heading}</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card} accessibilityLabel="Local rank section">
      <Text style={styles.title}>{heading}</Text>

      {isUnranked ? (
        <Text style={styles.emptyText} accessibilityLabel="Local rank empty">
          No local rank yet. Your rank will update when verified results are
          available.
        </Text>
      ) : (
        <View style={styles.statsGrid}>
          <Stat label="Rating" value={rank?.rating ?? 0} />
          <Stat
            label="Wins / Losses"
            value={`${rank?.wins ?? 0} / ${rank?.losses ?? 0}`}
          />
          <Stat label="Streak" value={rank?.streak ?? 0} />
        </View>
      )}

      {localChampion && localChampion.currentHolderUserId !== null ? (
        <View style={styles.championRow} accessibilityLabel="Local champion">
          <Text style={styles.championLabel}>Local champion</Text>
          <Text style={styles.championValue}>{localChampion.titleName}</Text>
        </View>
      ) : null}

      {myTitles.length > 0 ? (
        <View style={styles.titlesBlock} accessibilityLabel="My honor titles">
          <Text style={styles.sectionLabel}>Current titles</Text>
          {myTitles.map((t) => (
            <Text key={t.id} style={styles.titleRow}>
              {t.titleName}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <View style={styles.statCell} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
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
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  championRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.inputBackground,
    gap: 2,
  },
  championLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  championValue: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  titlesBlock: {
    gap: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  titleRow: {
    ...typography.body,
    color: colors.textPrimary,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
});
