import { StyleSheet, Text, View } from 'react-native';

import type { ChallengeStatus } from '@sportsgang/shared-types';
import { colors, radii, spacing, typography } from '../theme';

interface ChallengeStatusBadgeProps {
  status: ChallengeStatus;
  accessibilityLabel?: string;
}

interface BadgeStyleSpec {
  label: string;
  accent: string;
}

const STATUS_STYLES: Record<ChallengeStatus, BadgeStyleSpec> = {
  pending: { label: 'Pending', accent: colors.textSecondary },
  accepted: { label: 'Accepted', accent: colors.brand },
  verified: { label: 'Verified', accent: colors.success },
  disputed: { label: 'Disputed', accent: colors.error },
  declined: { label: 'Declined', accent: colors.textTertiary },
  cancelled: { label: 'Cancelled', accent: colors.textTertiary },
};

/**
 * Compact status pill for Challenge cards and the detail header.
 *
 * Copy stays neutral — disputed reads "Disputed" not "Failed", verified
 * reads "Verified" not "Won", because the badge sits next to user
 * names and a value-laden label would mis-imply blame.
 */
export function ChallengeStatusBadge({
  status,
  accessibilityLabel,
}: ChallengeStatusBadgeProps) {
  const spec = STATUS_STYLES[status];
  return (
    <View
      style={[styles.pill, { borderColor: spec.accent }]}
      accessibilityLabel={accessibilityLabel ?? `Status ${spec.label}`}
    >
      <Text style={[styles.text, { color: spec.accent }]}>{spec.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: colors.surfaceElevated,
    alignSelf: 'flex-start',
  },
  text: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 1.2,
  },
});
