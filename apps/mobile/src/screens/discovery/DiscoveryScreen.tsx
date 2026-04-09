import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { useDiscovery, PartnerCard } from '../../hooks/useDiscovery';
import { colors, radii, spacing, typography } from '../../theme';

// ─── Match banner ─────────────────────────────────────────────────────────────

function MatchBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.matchBanner} pointerEvents="none">
      <Text style={styles.matchBannerText}>It's a match!</Text>
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl?: string;
}) {
  const initials = displayName
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarInitials}>{initials}</Text>
    </View>
  );
}

// ─── Sport badge ──────────────────────────────────────────────────────────────

const _SPORT_LABEL: Record<string, string> = {
  gym: 'Gym',
  golf: 'Golf',
  tennis: 'Tennis',
  running: 'Running',
};

function SportBadge({ sport, level }: { sport: string; level: string }) {
  const sportLabel = _SPORT_LABEL[sport] ?? sport.charAt(0).toUpperCase() + sport.slice(1);
  const label = `${sportLabel} · ${level.charAt(0).toUpperCase() + level.slice(1)}`;

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
  const ageStr = partner.age ? `, ${partner.age}` : '';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Avatar displayName={partner.displayName} avatarUrl={partner.avatarUrl} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>
            {partner.displayName}
            {ageStr}
          </Text>
          {partner.suburb ? (
            <View style={styles.suburbBadge}>
              <Text style={styles.suburbBadgeText}>{partner.suburb}</Text>
            </View>
          ) : null}
          <View style={styles.sportBadges}>
            {partner.sportProfiles.map((sp) => (
              <SportBadge key={sp.sport} sport={sp.sport} level={sp.level} />
            ))}
          </View>
        </View>
      </View>

      {partner.bioExcerpt ? (
        <Text style={styles.bio} numberOfLines={2}>
          {partner.bioExcerpt}
        </Text>
      ) : null}

      <View style={styles.cardActions}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, styles.actionPass, pressed && styles.pressed]}
          onPress={onPass}
          disabled={actionInFlight}
          accessibilityRole="button"
          accessibilityLabel="Pass"
        >
          <Text style={styles.actionPassText}>Pass</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionButton, styles.actionSave, pressed && styles.pressed]}
          onPress={onSave}
          disabled={actionInFlight}
          accessibilityRole="button"
          accessibilityLabel="Save"
        >
          <Text style={styles.actionSaveText}>Save</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionButton, styles.actionLike, pressed && styles.pressed]}
          onPress={onLike}
          disabled={actionInFlight}
          accessibilityRole="button"
          accessibilityLabel="Like"
        >
          <Text style={styles.actionLikeText}>Like</Text>
        </Pressable>
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
        {/* Filter icon — placeholder for Wave 3 */}
        <Pressable
          style={styles.filterButton}
          accessibilityRole="button"
          accessibilityLabel="Filter (coming soon)"
          disabled
        >
          <Text style={styles.filterIcon}>Filter</Text>
        </Pressable>
      </View>

      {/* Sport toggle */}
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
            accessibilityLabel={_SPORT_LABEL[s]}
            accessibilityState={{ selected: sport === s }}
          >
            <Text
              style={[
                styles.sportTabText,
                sport === s && styles.sportTabTextActive,
              ]}
            >
              {_SPORT_LABEL[s]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Finding partners...</Text>
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
          <Text style={styles.emptyTitle}>You've seen everyone for now.</Text>
          <Text style={styles.emptyBody}>Check back soon for new workout partners.</Text>
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

      {/* Match banner overlay */}
      <MatchBanner visible={matchVisible} />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    color: colors.accent,
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
    borderRadius: radii.md,
  },
  filterIcon: {
    ...typography.label,
    color: colors.textTertiary,
  },
  sportToggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sportTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  sportTabActive: {
    backgroundColor: colors.brand,
  },
  sportTabText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  sportTabTextActive: {
    color: colors.textInverse,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  cardTop: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textInverse,
    letterSpacing: -0.5,
  },
  cardInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  cardName: {
    ...typography.h3,
  },
  suburbBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  suburbBadgeText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  sportBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  sportBadge: {
    backgroundColor: colors.background,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  sportBadgeText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  bio: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  actionPass: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionPassText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  actionSave: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionSaveText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  actionLike: {
    backgroundColor: colors.accent,
  },
  actionLikeText: {
    ...typography.button,
    color: colors.textInverse,
  },
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
    maxWidth: 260,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.65,
  },
  matchBanner: {
    position: 'absolute',
    top: '40%',
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  matchBannerText: {
    ...typography.h2,
    color: colors.textInverse,
  },
});
