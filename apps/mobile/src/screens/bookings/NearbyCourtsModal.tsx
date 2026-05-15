import { useEffect, useState } from 'react';
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
import { VenueMapView } from '../../components/VenueMapView';
import { useNearbyVenues } from '../../hooks/useNearbyVenues';
import type { VenueLocationStatus } from '../../hooks/useVenueLocation';
import { formatVenueLocation } from '../../lib/venueLocation';
import { colors, radii, spacing, typography } from '../../theme';
import type { Sport, Venue } from '@protin/shared-types';

type PickerMode = 'list' | 'map';

interface NearbyCourtsModalProps {
  isOpen: boolean;
  sport: Sport;
  /** Coordinates from useVenueLocation. Pass both or neither. */
  lat?: number;
  lng?: number;
  /**
   * Optional location-flow status from useVenueLocation. Drives the
   * compact banner under the header so users see why results are or
   * are not distance-sorted. Defaults to "idle" if omitted.
   */
  locationStatus?: VenueLocationStatus;
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
  locationStatus = 'idle',
  onSelect,
  onClose,
}: NearbyCourtsModalProps) {
  const { venues, isLoading, error, refresh } = useNearbyVenues({
    sport,
    lat,
    lng,
    enabled: isOpen,
  });

  // Default to list so every existing test + integration path keeps
  // working unchanged. The user opts into map mode explicitly.
  const [mode, setMode] = useState<PickerMode>('list');
  // Selected-pin state lives here (not in the parent) so List mode
  // stays untouched. Tap → show preview card → "Select this venue".
  const [mapSelectedVenue, setMapSelectedVenue] = useState<Venue | null>(null);

  // Reset the map selection on every close/open boundary and whenever
  // sport changes. Without this, a user who tapped a pin, dismissed the
  // modal without confirming, and reopened it (possibly for a different
  // sport with a different venue set) would still see the previous pin
  // as the live preview — and could "Select this venue" on something
  // that no longer matches the current result set.
  useEffect(() => {
    setMapSelectedVenue(null);
  }, [isOpen, sport]);

  // Second guard: if the venue results change mid-session (refresh, a
  // background re-fetch, sport switch race), drop the selected pin
  // when its id is no longer in the result set. Stay no-op when the
  // same venue is still present so an in-progress tap doesn't get
  // wiped by an incidental refetch.
  useEffect(() => {
    if (mapSelectedVenue === null) return;
    const stillPresent = venues.some((v) => v.id === mapSelectedVenue.id);
    if (!stillPresent) {
      setMapSelectedVenue(null);
    }
  }, [venues, mapSelectedVenue]);

  const hasCoords = lat !== undefined && lng !== undefined;
  // Catalog-honest fallback wording: only call results "near you" when
  // the server actually got coordinates. Otherwise we're showing the
  // Sydney venue catalog.
  const statusLabel: string | null = hasCoords
    ? 'Sorted near you'
    : locationStatus === 'denied' || locationStatus === 'unavailable'
      ? 'Location off. Showing Sydney catalog.'
      : null;

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

        {statusLabel ? (
          <View style={styles.statusBanner}>
            <Text
              style={styles.statusText}
              accessibilityLabel={`Location status: ${statusLabel}`}
            >
              {statusLabel}
            </Text>
          </View>
        ) : null}

        <View style={styles.modeToggle}>
          <Pressable
            onPress={() => setMode('list')}
            accessibilityRole="button"
            accessibilityLabel="Show venue list"
            accessibilityState={{ selected: mode === 'list' }}
            style={({ pressed }) => [
              styles.modeChip,
              mode === 'list' && styles.modeChipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.modeChipText,
                mode === 'list' && styles.modeChipTextActive,
              ]}
            >
              List
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('map')}
            accessibilityRole="button"
            accessibilityLabel="Show venue map"
            accessibilityState={{ selected: mode === 'map' }}
            style={({ pressed }) => [
              styles.modeChip,
              mode === 'map' && styles.modeChipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.modeChipText,
                mode === 'map' && styles.modeChipTextActive,
              ]}
            >
              Map
            </Text>
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
        ) : mode === 'list' ? (
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
        ) : (
          <View style={styles.mapWrap}>
            <VenueMapView
              venues={venues}
              userLat={lat}
              userLng={lng}
              selectedVenueId={mapSelectedVenue?.id ?? null}
              onMarkerPress={setMapSelectedVenue}
            />
            {mapSelectedVenue ? (
              <View style={styles.mapPreview} accessibilityLabel="Selected venue preview">
                <View style={styles.mapPreviewText}>
                  <Text style={styles.mapPreviewName} numberOfLines={1}>
                    {mapSelectedVenue.name}
                  </Text>
                  {mapSelectedVenue.area || mapSelectedVenue.address ? (
                    <Text style={styles.mapPreviewArea} numberOfLines={1}>
                      {formatVenueLocation(mapSelectedVenue)}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => handleUse(mapSelectedVenue)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${mapSelectedVenue.name} for session`}
                  style={({ pressed }) => [
                    styles.mapPreviewButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.mapPreviewButtonText}>Select this venue</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.mapHint} pointerEvents="none">
                <Text style={styles.mapHintText}>
                  {hasCoords
                    ? 'Tap a pin to select a venue.'
                    : 'Tap a pin to select. Map is centred on the Sydney catalog — turn on location for distance sort.'}
                </Text>
              </View>
            )}
          </View>
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
  statusBanner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  statusText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  modeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modeChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  modeChipText: {
    ...typography.button,
    fontSize: 13,
    color: colors.textSecondary,
  },
  modeChipTextActive: {
    color: colors.textInverse,
  },
  mapWrap: {
    flex: 1,
  },
  mapHint: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapHintText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  mapPreview: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  mapPreviewText: {
    flex: 1,
    gap: 2,
  },
  mapPreviewName: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
  },
  mapPreviewArea: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  mapPreviewButton: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  mapPreviewButtonText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 13,
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
