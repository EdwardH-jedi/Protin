import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { useDiscovery, PartnerCard } from '../../hooks/useDiscovery';
import { SPORT_LABELS, sportLabel } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';

// ─── Match banner ─────────────────────────────────────────────────────────────

function MatchBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.matchBanner} pointerEvents="none">
      <Text style={styles.matchBannerEyebrow}>Linked</Text>
      <Text style={styles.matchBannerText}>Linked up.</Text>
    </View>
  );
}

// ─── Hero / avatar ────────────────────────────────────────────────────────────

function CardHero({
  displayName,
  avatarUrl,
  age,
  suburb,
}: {
  displayName: string;
  avatarUrl?: string;
  age?: number | null;
  suburb?: string | null;
}) {
  const initials = displayName
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
  const ageStr = age ? `, ${age}` : '';

  return (
    <View style={styles.hero}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.heroImage}
          resizeMode="cover"
          accessibilityLabel={`${displayName} profile photo`}
        />
      ) : (
        <View style={styles.heroFallback}>
          <Text style={styles.heroFallbackInitials}>{initials || '·'}</Text>
        </View>
      )}

      {/* Gradient-ish darken layered on top of the image so the name reads
          on any photo without depending on a gradient library. */}
      <View style={styles.heroDarken} />

      <View style={styles.heroOverlay}>
        <Text style={styles.heroName}>
          {displayName}
          {ageStr}
        </Text>
        {suburb ? <Text style={styles.heroSuburb}>{suburb}</Text> : null}
      </View>
    </View>
  );
}

// ─── Sport badge ──────────────────────────────────────────────────────────────

function SportBadge({ sport, level }: { sport: string; level: string }) {
  const label = `${sportLabel(sport)} · ${level.charAt(0).toUpperCase() + level.slice(1)}`;
  return (
    <View style={styles.sportBadge}>
      <Text style={styles.sportBadgeText}>{label}</Text>
    </View>
  );
}

// ─── Partner card ─────────────────────────────────────────────────────────────

interface PartnerCardProps {
  partner: PartnerCard;
  onLike: () => void;
  onPass: () => void;
  onSave: () => void;
  actionInFlight: boolean;
}

function PartnerCardView({
  partner,
  onLike,
  onPass,
  onSave,
  actionInFlight,
}: PartnerCardProps) {
  return (
    <View style={styles.card}>
      <CardHero
        displayName={partner.displayName}
        avatarUrl={partner.avatarUrl}
        age={partner.age}
        suburb={partner.suburb}
      />

      <View style={styles.cardBody}>
        {partner.sportProfiles.length > 0 ? (
          <View style={styles.sportBadges}>
            {partner.sportProfiles.map((sp) => (
              <SportBadge key={sp.sport} sport={sp.sport} level={sp.level} />
            ))}
          </View>
        ) : null}

        {partner.bioExcerpt ? (
          <Text style={styles.bio} numberOfLines={3}>
            {partner.bioExcerpt}
          </Text>
        ) : null}

        <View style={styles.cardActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionPass,
              pressed && styles.pressed,
            ]}
            onPress={onPass}
            disabled={actionInFlight}
            accessibilityRole="button"
            accessibilityLabel="Pass"
          >
            <Text style={styles.actionPassText}>Pass</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionSave,
              pressed && styles.pressed,
            ]}
            onPress={onSave}
            disabled={actionInFlight}
            accessibilityRole="button"
            accessibilityLabel="Save"
          >
            <Text style={styles.actionSaveText}>Save</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionLike,
              pressed && styles.pressed,
            ]}
            onPress={onLike}
            disabled={actionInFlight}
            accessibilityRole="button"
            accessibilityLabel="Like"
          >
            <Text style={styles.actionLikeText}>Like</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function DiscoveryScreen() {
  const { partners, isLoading, error, sport, setSport, recordAction, fetchMore } =
    useDiscovery();

  const [matchVisible, setMatchVisible] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  function showMatchBanner() {
    setMatchVisible(true);
    setTimeout(() => setMatchVisible(false), 2000);
  }

  async function handleAction(
    targetUserId: string,
    action: 'like' | 'pass' | 'save'
  ) {
    if (actingOn) return;
    setActingOn(targetUserId);
    try {
      const result = await recordAction(targetUserId, action);
      if (action === 'like' && result.matchCreated) {
        showMatchBanner();
      }
    } catch {
      // silently swallow action errors — card stays visible, user can retry
    } finally {
      setActingOn(null);
    }
  }

  const renderItem = useCallback(
    ({ item }: { item: PartnerCard }) => (
      <PartnerCardView
        partner={item}
        onLike={() => handleAction(item.userId, 'like')}
        onPass={() => handleAction(item.userId, 'pass')}
        onSave={() => handleAction(item.userId, 'save')}
        actionInFlight={actingOn === item.userId}
      />
    ),
    [actingOn, handleAction]
  );

  return (
    <Screen padded={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Sydney</Text>
          <Text style={styles.headerTitle}>Discover</Text>
        </View>
        <Pressable
          style={styles.filterButton}
          accessibilityRole="button"
          accessibilityLabel="Filter (coming soon)"
          disabled
        >
          <Text style={styles.filterIcon}>Filter</Text>
        </Pressable>
      </View>

      {/* Sport toggle — pill chips */}
      <View style={styles.sportToggle}>
        {(['gym', 'golf', 'tennis', 'running'] as const).map((s) => (
          <Pressable
            key={s}
            style={({ pressed }) => [
              styles.sportTab,
              sport === s && styles.sportTabActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setSport(s)}
            accessibilityRole="tab"
            accessibilityLabel={SPORT_LABELS[s]}
            accessibilityState={{ selected: sport === s }}
          >
            <Text
              style={[
                styles.sportTabText,
                sport === s && styles.sportTabTextActive,
              ]}
            >
              {SPORT_LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Finding players...</Text>
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={fetchMore}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : partners.length === 0 ? (
        <View style={styles.centred}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>·</Text>
          </View>
          <Text style={styles.emptyTitle}>No more gang-mates nearby.</Text>
          <Text style={styles.emptyBody}>Check back soon — new players join every week.</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={fetchMore}
          >
            <Text style={styles.retryText}>Refresh</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={partners}
          keyExtractor={(item) => item.userId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <MatchBanner visible={matchVisible} />
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const HERO_HEIGHT = 280;

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.h2,
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  filterIcon: {
    ...typography.label,
    color: colors.textTertiary,
  },

  // Sport toggle (pill chips)
  sportToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sportTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sportTabActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  sportTabText: {
    ...typography.button,
    fontSize: 14,
    color: colors.textSecondary,
  },
  sportTabTextActive: {
    color: colors.textInverse,
  },

  // List
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.separator,
    shadowColor: colors.brandDarkest,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },

  // Hero
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: colors.brandSoft,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFallbackInitials: {
    fontSize: 64,
    fontWeight: '700',
    color: colors.textInverse,
    letterSpacing: -2,
  },
  heroDarken: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT * 0.5,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xl,
  },
  heroName: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    // Hardcoded white: the hero darken overlay is the same on every card so
    // light text is the contract here, independent of theme `textInverse`.
    color: '#FFFFFF',
  },
  heroSuburb: {
    ...typography.bodyLarge,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 2,
  },

  // Card body
  cardBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sportBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  sportBadge: {
    backgroundColor: colors.brandSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  sportBadgeText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.brand,
  },
  bio: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
    lineHeight: 24,
  },

  // Actions
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  actionButton: {
    flex: 1,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  actionPass: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionPassText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  actionSave: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionSaveText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  actionLike: {
    backgroundColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  actionLikeText: {
    ...typography.button,
    color: colors.textInverse,
  },

  // Centred container (loading / empty / error)
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  errorTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  errorBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.full,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyIconText: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.brand,
    lineHeight: 36,
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 280,
  },
  retryButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: {
    ...typography.button,
    color: colors.textInverse,
  },

  pressed: {
    opacity: 0.65,
  },

  // Match banner
  matchBanner: {
    position: 'absolute',
    top: '38%',
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: radii.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    shadowColor: colors.brandDarkest,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  matchBannerEyebrow: {
    ...typography.label,
    color: colors.textInverse,
    marginBottom: spacing.xs,
  },
  matchBannerText: {
    ...typography.h2,
    color: colors.textInverse,
  },
});
