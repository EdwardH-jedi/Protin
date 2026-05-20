import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { VenueCard } from '../../components/VenueCard';
import { VenueMapView } from '../../components/VenueMapView';
import { useNearbyVenues } from '../../hooks/useNearbyVenues';
import type { VenueLocationStatus } from '../../hooks/useVenueLocation';
import { formatVenueLocation } from '../../lib/venueLocation';
import { colors, radii, spacing, typography } from '../../theme';
import type { Venue, VenueProviderStatus } from '@protin/shared-types';

type PickerMode = 'list' | 'map';

/**
 * Radius option keys used for the radius chip row. ``'near'`` keeps the
 * backend default (10 km) and omits ``radius_km`` from the URL so the
 * v1.0 wire shape is preserved. Explicit km values set ``radius_km`` to
 * that integer. ``'wider'`` maps to {@link WIDER_RADIUS_KM} — the upper
 * bound of the API validator (apps/api/app/routers/venues.py — le=50.0).
 */
type RadiusOption = 'near' | 5 | 10 | 25 | 'wider';

const WIDER_RADIUS_KM = 50;

/**
 * 300 ms debounce on the search field. Long enough that a fast typist
 * doesn't fire a request on every keystroke (Google Places Text Search
 * is billed per request) but short enough that the picker still feels
 * responsive once they pause.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Per-page venue cap requested from /venues/nearby. The backend caps
 * at 50 (apps/api/app/routers/venues.py — le=50); the picker pulls the
 * full page so the map / list looks alive on first open, especially in
 * outer suburbs where the curated seed catalog is sparse.
 */
const PICKER_PAGE_LIMIT = 50;

interface NearbyCourtsModalProps {
  isOpen: boolean;
  /**
   * Sport identifier passed straight to /venues/nearby. Accepts any
   * Battle/Game sport string (basketball, soccer, badminton, …) — see
   * useNearbyVenues for the backend contract. The modal renders the
   * sport in the header in uppercase regardless.
   */
  sport: string;
  /** Coordinates from useVenueLocation. Pass both or neither. */
  lat?: number;
  lng?: number;
  /**
   * Optional location-flow status from useVenueLocation. Drives the
   * compact banner under the header so users see why results are or
   * are not distance-sorted. Defaults to "idle" if omitted.
   */
  locationStatus?: VenueLocationStatus;
  /**
   * When true AND coordinates are present, show a radius chips row
   * that lets the user expand the search radius up to
   * {@link WIDER_RADIUS_KM} km. Default off so existing booking/event
   * flows keep their current narrow default-radius behavior and URL
   * shape.
   */
  enableWiderResults?: boolean;
  /**
   * Optional manual-entry fallback. When provided, renders an input at
   * the bottom of the modal so users can type a venue/court name when
   * the catalog doesn't list it. The callback receives the trimmed
   * non-empty text; parents are responsible for clearing any
   * structured selectedVenue and closing the modal (mirrors the
   * onSelect contract).
   */
  onSelectManual?: (text: string) => void;
  onSelect: (venue: Venue) => void;
  onClose: () => void;
}

function resolveRadiusKm(option: RadiusOption): number | undefined {
  if (option === 'near') return undefined;
  if (option === 'wider') return WIDER_RADIUS_KM;
  return option;
}

/**
 * One-line user-facing message for provider statuses that we want the
 * picker to surface explicitly. Returning ``null`` means the status is
 * normal (``"ok"`` or ``"disabled"``) and no banner should appear.
 */
function providerStatusBannerText(
  status: VenueProviderStatus,
  hasCoords: boolean,
): string | null {
  switch (status) {
    case 'quota_exceeded':
      return 'Search quota reached. Showing seed catalog only.';
    case 'error':
      return 'Google Places unavailable. Showing seed catalog only.';
    case 'missing_coordinates':
      return hasCoords
        ? null
        : 'Enable location to search beyond the Sydney catalog.';
    case 'ok':
    case 'disabled':
    default:
      return null;
  }
}

function stripHtmlAttribution(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

const RADIUS_CHIPS: readonly {
  value: RadiusOption;
  label: string;
  /**
   * Two chips inherit the pre-v1.1 accessibility labels so existing
   * UI tests keep matching by label without modification. The new
   * granular chips get their own bespoke labels.
   */
  a11yLabel: string;
}[] = [
  { value: 'near', label: 'Near', a11yLabel: 'Show nearby venues' },
  { value: 5, label: '5 km', a11yLabel: 'Search within 5 km' },
  { value: 10, label: '10 km', a11yLabel: 'Search within 10 km' },
  { value: 25, label: '25 km', a11yLabel: 'Search within 25 km' },
  { value: 'wider', label: 'Wider', a11yLabel: 'Show wider results' },
];

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
  enableWiderResults = false,
  onSelectManual,
  onSelect,
  onClose,
}: NearbyCourtsModalProps) {
  // Default to list so every existing test + integration path keeps
  // working unchanged. The user opts into map mode explicitly.
  const [mode, setMode] = useState<PickerMode>('list');
  // Selected-pin state lives here (not in the parent) so List mode
  // stays untouched. Tap → show preview card → "Select this venue".
  const [mapSelectedVenue, setMapSelectedVenue] = useState<Venue | null>(null);
  // Radius chip state. Resets on every isOpen/sport boundary so a
  // stale toggle from a previous session doesn't quietly widen the
  // new one.
  const [radiusOption, setRadiusOption] = useState<RadiusOption>('near');
  // Manual-entry buffer for the bottom fallback. Stays local to the
  // modal — the parent only sees the trimmed value when the user
  // explicitly taps "Use this venue".
  const [manualText, setManualText] = useState('');
  // Search box — debounced into ``debouncedSearch`` which is what
  // actually drives the network call. Typing fast does not fire a
  // request per keystroke.
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const hasCoords = lat !== undefined && lng !== undefined;
  const radiusKm = hasCoords && enableWiderResults
    ? resolveRadiusKm(radiusOption)
    : undefined;

  // Source mode for /venues/nearby (Stream 2 backend, Stream 3 mobile):
  //
  //   * Coords present → "both"  — seed catalog + Google Places, merged
  //                                + deduped server-side. Densifies the
  //                                picker for sports/areas where the
  //                                seed catalog is sparse.
  //   * No coords     → "seed"  — pure catalog. "places" is silent
  //                                without coords (server can't query
  //                                Google without a centre) so "seed"
  //                                is the honest source label.
  //
  // The Google API key stays on the backend; mobile never sees it.
  const sourceMode: 'seed' | 'both' = hasCoords ? 'both' : 'seed';

  const {
    venues,
    isLoading,
    isLoadingMore,
    error,
    providerStatus,
    hasMore,
    refresh,
    loadMore,
  } = useNearbyVenues({
    sport,
    lat,
    lng,
    radiusKm,
    source: sourceMode,
    q: debouncedSearch,
    limit: PICKER_PAGE_LIMIT,
    enabled: isOpen,
  });

  // Google Places terms require a "Powered by Google" attribution mark
  // whenever Places-sourced rows are visibly surfaced. Seed-only result
  // sets must NOT show the chip (it would falsely imply Google data).
  const requiresGoogleAttribution = venues.some(
    (v) => v.source === 'google_places' || v.attributionRequired === true,
  );

  const googleAttributions = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const venue of venues) {
      for (const raw of venue.attributions ?? []) {
        const label = stripHtmlAttribution(raw);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        labels.push(label);
      }
    }
    return labels;
  }, [venues]);

  // Reset transient pickers / inputs on every close/open boundary and
  // whenever sport changes — see comment on radiusOption above.
  useEffect(() => {
    setMapSelectedVenue(null);
    setManualText('');
    setRadiusOption('near');
    setSearchText('');
    setDebouncedSearch('');
  }, [isOpen, sport]);

  // Debounce searchText → debouncedSearch. Cleared immediately when
  // the input is empty so the picker snaps back to the default
  // sport-based query without waiting out the timer.
  useEffect(() => {
    if (searchText.trim().length === 0) {
      setDebouncedSearch('');
      return;
    }
    const handle = setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchText]);

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

  // Catalog-honest fallback wording: only call results "near you" when
  // the server actually got coordinates. The wider/explicit-km branches
  // reuse the same honesty rule — don't claim "near you" once the user
  // has explicitly asked to look further out.
  const statusLabel: string | null = useMemo(() => {
    if (!hasCoords) {
      return locationStatus === 'denied' || locationStatus === 'unavailable'
        ? 'Location off. Showing Sydney catalog.'
        : null;
    }
    if (radiusOption === 'near') return 'Sorted near you';
    if (radiusOption === 'wider') return `Wider results (within ${WIDER_RADIUS_KM} km)`;
    return `Within ${radiusOption} km`;
  }, [hasCoords, locationStatus, radiusOption]);

  const providerBanner = providerStatusBannerText(providerStatus, hasCoords);

  const handleUse = (venue: Venue) => {
    onSelect(venue);
    onClose();
  };

  const handleOpenBooking = (venue: Venue) => {
    if (venue.bookingUrl) {
      void Linking.openURL(venue.bookingUrl);
    }
  };

  const handleUseManual = () => {
    if (!onSelectManual) return;
    const trimmed = manualText.trim();
    if (trimmed.length === 0) return;
    onSelectManual(trimmed);
    onClose();
  };

  const showWiderToggle = enableWiderResults && hasCoords;
  const showManualFooter = !!onSelectManual;
  const manualTrimmedNonEmpty = manualText.trim().length > 0;

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

        <View style={styles.searchRow}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search venues (e.g. Bondi tennis)"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="Search venues"
          />
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

        {providerBanner ? (
          <View
            style={styles.providerBanner}
            accessibilityLabel={`Provider status: ${providerBanner}`}
          >
            <Text style={styles.providerBannerText}>{providerBanner}</Text>
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

        {showWiderToggle ? (
          <View style={styles.radiusToggle}>
            {RADIUS_CHIPS.map((chip) => {
              const selected = radiusOption === chip.value;
              return (
                <Pressable
                  key={String(chip.value)}
                  onPress={() => setRadiusOption(chip.value)}
                  accessibilityRole="button"
                  accessibilityLabel={chip.a11yLabel}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.radiusChip,
                    selected && styles.radiusChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.radiusChipText,
                      selected && styles.radiusChipTextActive,
                    ]}
                  >
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

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
              {hasCoords && enableWiderResults && radiusOption !== 'wider'
                ? 'Try expanding your radius, or type a court name below.'
                : `We don't have any ${sport} venues here yet. Tap the location field below to type one in instead.`}
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
            ListFooterComponent={
              hasMore || isLoadingMore ? (
                <View style={styles.loadMoreRow}>
                  {isLoadingMore ? (
                    <ActivityIndicator color={colors.brand} />
                  ) : (
                    <Pressable
                      onPress={loadMore}
                      accessibilityRole="button"
                      accessibilityLabel="Load more venues"
                      style={({ pressed }) => [
                        styles.loadMoreButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.loadMoreText}>Load more</Text>
                    </Pressable>
                  )}
                </View>
              ) : null
            }
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
                    : 'Tap a pin to select. Map is centred on the Sydney catalog - turn on location for distance sort.'}
                </Text>
              </View>
            )}
          </View>
        )}

        {requiresGoogleAttribution ? (
          <View
            style={styles.attributionChip}
            accessibilityLabel="Powered by Google"
          >
            <Text style={styles.attributionText}>Powered by Google</Text>
            {googleAttributions.length > 0 ? (
              <Text style={styles.thirdPartyAttributionText} numberOfLines={2}>
                Map data: {googleAttributions.join(', ')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {showManualFooter ? (
          <View
            style={styles.manualFooter}
            accessibilityLabel="Manual venue entry"
          >
            <Text style={styles.manualLabel}>Can&apos;t find your court?</Text>
            <View style={styles.manualRow}>
              <TextInput
                value={manualText}
                onChangeText={setManualText}
                placeholder="Type venue or court name"
                placeholderTextColor={colors.textTertiary}
                maxLength={200}
                autoCapitalize="words"
                autoCorrect={false}
                style={styles.manualInput}
                accessibilityLabel="Type venue or court name"
                returnKeyType="done"
                onSubmitEditing={handleUseManual}
              />
              <Pressable
                onPress={handleUseManual}
                disabled={!manualTrimmedNonEmpty}
                accessibilityRole="button"
                accessibilityLabel="Use typed venue"
                accessibilityState={{ disabled: !manualTrimmedNonEmpty }}
                style={({ pressed }) => [
                  styles.manualButton,
                  !manualTrimmedNonEmpty && styles.manualButtonDisabled,
                  pressed && manualTrimmedNonEmpty && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.manualButtonText,
                    !manualTrimmedNonEmpty && styles.manualButtonTextDisabled,
                  ]}
                >
                  Use this venue
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
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
  searchRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    backgroundColor: colors.surface,
  },
  searchInput: {
    backgroundColor: colors.inputBackground,
    color: colors.textPrimary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
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
  providerBanner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  providerBannerText: {
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
  radiusToggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  radiusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  radiusChipActive: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  radiusChipText: {
    ...typography.button,
    fontSize: 13,
    color: colors.textSecondary,
  },
  radiusChipTextActive: {
    color: colors.brand,
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
  loadMoreRow: {
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  loadMoreButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  loadMoreText: {
    ...typography.button,
    color: colors.brand,
    fontSize: 13,
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
  attributionChip: {
    // Slim, subdued chip — Google requires the attribution to be
    // visible whenever Places data is shown, but it must not compete
    // visually with primary picker actions. Lives above the manual
    // footer so it appears in a stable position regardless of list/
    // map/empty/error state.
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'flex-end',
    gap: 2,
  },
  attributionText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontSize: 12,
  },
  thirdPartyAttributionText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: 'right',
  },
  manualFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.xs,
  },
  manualLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  manualRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  manualInput: {
    flex: 1,
    // Use the same input surface every other TextInput in the app uses
    // (CreateBattle, BookingComposer, Login, Register, EditProfile).
    backgroundColor: colors.inputBackground,
    color: colors.textPrimary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  manualButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  manualButtonDisabled: {
    backgroundColor: colors.border,
  },
  manualButtonText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 13,
  },
  manualButtonTextDisabled: {
    color: colors.textTertiary,
  },
  pressed: {
    opacity: 0.65,
  },
});
