import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import type { Venue } from '@sportsgang/shared-types';

interface VenueCardProps {
  venue: Venue;
  onUse: () => void;
  onOpenBookingUrl?: () => void;
}

function formatDistance(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Single venue tile used by NearbyCourtsModal. SportsGang dark/neon style:
 * dark surface card, subtle border, lime CTA. The "Open booking" link is
 * shown only when the venue has a real bookingUrl AND is_bookable=true so
 * we never claim something is bookable that isn't.
 */
export function VenueCard({ venue, onUse, onOpenBookingUrl }: VenueCardProps) {
  const distance = formatDistance(venue.distanceKm);
  const sportLabel = venue.sportTags.join(' • ').toUpperCase();
  const showBookingCta = venue.isBookable && !!venue.bookingUrl && !!onOpenBookingUrl;

  return (
    <View style={styles.card} accessibilityLabel={`Venue ${venue.name}`}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>
          {venue.name}
        </Text>
        {distance ? <Text style={styles.distance}>{distance}</Text> : null}
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.sportPill}>{sportLabel}</Text>
        {venue.area ? <Text style={styles.area}>{venue.area}</Text> : null}
      </View>

      {venue.address ? (
        <Text style={styles.address} numberOfLines={2}>
          {venue.address}
        </Text>
      ) : null}

      {venue.notes ? (
        <Text style={styles.notes} numberOfLines={2}>
          {venue.notes}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onUse}
          accessibilityRole="button"
          accessibilityLabel={`Use ${venue.name} for session`}
          style={({ pressed }) => [styles.useButton, pressed && styles.pressed]}
        >
          <Text style={styles.useButtonText}>Use for session</Text>
        </Pressable>

        {showBookingCta ? (
          <Pressable
            onPress={onOpenBookingUrl}
            accessibilityRole="link"
            accessibilityLabel={`Open booking for ${venue.name}`}
            style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
          >
            <Text style={styles.linkButtonText}>Open booking</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  name: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  distance: {
    ...typography.label,
    color: colors.brand,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sportPill: {
    ...typography.label,
    color: colors.textInverse,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  area: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  address: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  notes: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  useButton: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  useButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  linkButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  linkButtonText: {
    ...typography.button,
    color: colors.brand,
  },
  pressed: {
    opacity: 0.65,
  },
});
