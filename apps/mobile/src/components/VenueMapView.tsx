import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { colors, radii, spacing, typography } from '../theme';
import type { Venue } from '@protin/shared-types';

interface VenueMapViewProps {
  /** Venues to render as map pins. Markers are skipped for any venue
   * missing latitude or longitude. */
  venues: Venue[];
  /** Optional user-location pin. Set to null when coordinates aren't
   * available — the map then auto-frames the venue cluster instead. */
  userLat?: number;
  userLng?: number;
  /** Currently selected venue, drawn with the brand-color marker so the
   * user can see which pin they tapped. */
  selectedVenueId?: string | null;
  /** Called when a pin is pressed. The parent owns the selected-venue
   * state; this component just surfaces the tap. */
  onMarkerPress: (venue: Venue) => void;
}

/**
 * Lightweight read-only map view used by NearbyCourtsModal's Map mode.
 *
 * Wraps ``react-native-maps``' platform-default ``MapView`` (Apple
 * MapKit on iOS, Google Maps on Android) with a single layer of
 * markers — one for each venue in ``venues`` plus an optional
 * user-location dot. There is intentionally no clustering, no route
 * drawing, no search input, and no marker creation; those are
 * deliberate non-goals for the MVP.
 *
 * Native rendering requires a development build — the map area is
 * blank in Expo Go. Callers that show this in an Expo Go session
 * should provide a List-mode fallback (see NearbyCourtsModal).
 */
export function VenueMapView({
  venues,
  userLat,
  userLng,
  selectedVenueId,
  onMarkerPress,
}: VenueMapViewProps) {
  const hasUserCoords = userLat !== undefined && userLng !== undefined;

  // Frame the visible region around either the user pin (preferred,
  // since results are sorted by distance from them) or the centroid of
  // the venue cluster as a fallback. The deltas are conservative — a
  // ~0.15° span over Sydney clears the eastern suburbs / inner west
  // belt without zooming so far in that "Bondi vs Annandale" feels far.
  const initialRegion: Region | undefined = useMemo(() => {
    if (hasUserCoords && userLat !== undefined && userLng !== undefined) {
      return {
        latitude: userLat,
        longitude: userLng,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      };
    }
    const points = venues.filter(
      (v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude)
    );
    if (points.length === 0) return undefined;
    const lat = points.reduce((s, v) => s + v.latitude, 0) / points.length;
    const lng = points.reduce((s, v) => s + v.longitude, 0) / points.length;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    };
  }, [hasUserCoords, userLat, userLng, venues]);

  // Without a region we can't render a useful map — the caller should
  // have already gated this case behind a list-mode fallback, but
  // defend against it with a clear copy block just in case.
  if (initialRegion === undefined) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>Map unavailable</Text>
        <Text style={styles.fallbackBody}>
          Turn on location to see venues on a map.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityLabel="Venue map">
      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={initialRegion}
        // Disable surfaces we don't use in the MVP — pure pin-picker.
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        toolbarEnabled={false}
      >
        {hasUserCoords && userLat !== undefined && userLng !== undefined ? (
          <Marker
            key="venue-map-user"
            coordinate={{ latitude: userLat, longitude: userLng }}
            title="You are here"
            pinColor={colors.textSecondary}
            accessibilityLabel="Your location marker"
          />
        ) : null}
        {venues
          .filter(
            (v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude)
          )
          .map((v) => {
            const isSelected = v.id === selectedVenueId;
            return (
              <Marker
                key={v.id}
                identifier={v.id}
                coordinate={{ latitude: v.latitude, longitude: v.longitude }}
                title={v.name}
                description={v.area ?? v.address ?? undefined}
                pinColor={isSelected ? colors.brand : colors.error}
                onPress={() => onMarkerPress(v)}
                accessibilityLabel={`Venue pin ${v.name}`}
              />
            );
          })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
  },
  fallbackTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  fallbackBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
