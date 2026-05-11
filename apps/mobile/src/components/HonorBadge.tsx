import { StyleSheet, Text, View } from 'react-native';

import type { HonorLevel } from '../lib/rank';
import { colors, radii, spacing, typography } from '../theme';

interface HonorBadgeProps {
  /** Honor level. Omit when the summary is unavailable to render the fallback. */
  honorLevel?: HonorLevel | null;
  /** Optional honor score. Hidden in compact mode. */
  honorScore?: number | null;
  /** Compact = level only (no numeric score). Default false. */
  compact?: boolean;
  /** Loading hint — renders a subtle dim variant. */
  isLoading?: boolean;
  /** Accessibility label override. */
  accessibilityLabel?: string;
}

const LEVEL_ACCENTS: Record<HonorLevel, string> = {
  Rookie: colors.textTertiary,
  Regular: colors.textSecondary,
  Trusted: colors.brand,
  Captain: colors.brand,
  Legend: colors.accent,
};

/**
 * Small Honor trust pill used at decision points (event cards, host
 * cards, partner cards).
 *
 * Copy rules:
 *   - Never call this "popularity" or a ranking against other users.
 *   - Never claim AI moderation or verified identity.
 *   - Never label it "leaderboard".
 *   - Fallback when summary unavailable: "New player".
 */
export function HonorBadge({
  honorLevel,
  honorScore,
  compact = false,
  isLoading = false,
  accessibilityLabel,
}: HonorBadgeProps) {
  if (isLoading) {
    return (
      <View
        style={[styles.pill, styles.pillMuted]}
        accessibilityLabel={accessibilityLabel ?? 'Honor loading'}
      >
        <Text style={styles.textMuted}>Honor</Text>
      </View>
    );
  }

  if (!honorLevel) {
    return (
      <View
        style={[styles.pill, styles.pillMuted]}
        accessibilityLabel={accessibilityLabel ?? 'New player'}
      >
        <Text style={styles.textMuted}>New player</Text>
      </View>
    );
  }

  const accent = LEVEL_ACCENTS[honorLevel];
  const showScore =
    !compact && typeof honorScore === 'number' && Number.isFinite(honorScore);
  const fallbackLabel = showScore
    ? `${honorLevel} ${honorScore}`
    : honorLevel;

  return (
    <View
      style={[styles.pill, { borderColor: accent }]}
      accessibilityLabel={accessibilityLabel ?? `Honor ${fallbackLabel}`}
    >
      <Text style={[styles.text, { color: accent }]}>{honorLevel}</Text>
      {showScore ? (
        <Text style={[styles.score, { color: accent }]}>- {honorScore}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: colors.surfaceElevated,
    gap: 4,
    alignSelf: 'flex-start',
  },
  pillMuted: {
    borderColor: colors.border,
  },
  text: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  textMuted: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.textTertiary,
  },
  score: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 0.6,
  },
});
