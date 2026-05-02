import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { VenueCard } from '../../components/VenueCard';
import { useNearbyVenues } from '../../hooks/useNearbyVenues';
import { colors, radii, spacing, typography } from '../../theme';
import type { Sport, Venue } from '@protin/shared-types';

interface NearbyCourtsModalProps {
  isOpen: boolean;
  sport: Sport;
  /** Optional coordinates if a future location source is wired in. */
  lat?: number;
  lng?: number;
  onSelect: (venue: Venue) => void;
  onClose: () => void;
}

/**
 * Full-screen modal shown over BookingComposer for picking a venue.
 *
 * Loads venues for the requested sport and renders them as VenueCards. The
 * "Use for session" button on a card calls onSelect with the chosen venue
 * and closes the modal — the parent composer is responsible for storing the
 * selection and including it in the booking payload.
 */
export function NearbyCourtsModal({
  isOpen,
  sport,
  lat,
  lng,
  onSelect,
  onClose,
}: NearbyCourtsModalProps) {
  const { venues, isLoading, error, refresh } = useNearbyVenues({
    sport,
    lat,
    lng,
    enabled: isOpen,
  });

  const handleUse = (venue: Venue) => {
    onSelect(venue);
    onClose();
  };

  const handleOpenBooking = (venue: Venue) => {
    if (venue.bookingUrl) {
      void Linking.openURL(venue.bookingUrl);
    }
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Courts &amp; venues</Text>
            <Text style={styles.subtitle}>{sport.toUpperCase()}</Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close courts and venues"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : error ? (
          <View style={styles.centred}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={refresh}
              accessibilityRole="button"
              accessibilityLabel="Retry loading courts"
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : venues.length === 0 ? (
          <View style={styles.centred}>
            <Text style={styles.emptyTitle}>No courts found</Text>
            <Text style={styles.emptyBody}>
              We don&apos;t have any {sport} venues seeded yet. Tap the location field below to
              type one in instead.
            </Text>
          </View>
        ) : (
          <FlatList
            data={venues}
            keyExtractor={(v) => v.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <VenueCard
                venue={item}
                onUse={() => handleUse(item)}
                onOpenBookingUrl={
                  item.isBookable && item.bookingUrl ? () => handleOpenBooking(item) : undefined
                }
              />
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  headerCenter: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.label,
    color: colors.textTertiary,
  },
  closeButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  closeText: {
    ...typography.button,
    color: colors.brand,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.md,
  },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.button,
    color: colors.brand,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
});
