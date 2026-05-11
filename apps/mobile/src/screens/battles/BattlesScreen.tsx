import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '../../components/Screen';
import { useEvents } from '../../hooks/useEvents';
import {
  BATTLE_SPORTS,
  type EventMode,
  type EventSummary,
  formatEventWhen,
  sportLabelForBattle,
} from '../../lib/events';
import { colors, radii, spacing, typography } from '../../theme';
import type { BattlesScreenProps } from '../../navigation/types';

type StatusFilter = 'open' | 'mine' | 'all';
type ModeFilter = 'all' | EventMode;
type SportFilter = 'all' | string;

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'mine', label: 'Mine' },
  { value: 'all', label: 'All' },
];

const MODE_CHIPS: { value: ModeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ranked', label: 'Ranked' },
  { value: 'casual', label: 'Casual' },
];

const SPORT_CHIPS = [{ value: 'all' as const, label: 'All' }, ...BATTLE_SPORTS];

export function BattlesScreen({ navigation }: BattlesScreenProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [sportFilter, setSportFilter] = useState<SportFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { items, isLoading, error, refresh } = useEvents({
    mine: statusFilter === 'mine',
    mode: modeFilter === 'all' ? undefined : modeFilter,
    sport: sportFilter === 'all' ? undefined : sportFilter,
  });

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  const list = useMemo(() => items, [items]);

  const renderEmpty = () => {
    if (error) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Could not load battles</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Pressable
            onPress={() => void refresh()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading battles"
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No games nearby yet.</Text>
        <Text style={styles.emptyBody}>
          Start the first one and build your SportsGang.
        </Text>
        <Pressable
          onPress={() => navigation.navigate('CreateBattle')}
          accessibilityRole="button"
          accessibilityLabel="Host a game"
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Host a game</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>{'←'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>THIS WEEK</Text>
          <Text style={styles.headerTitle}>Battles</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('CreateBattle')}
          accessibilityRole="button"
          accessibilityLabel="Host a game"
          style={({ pressed }) => [styles.hostShortcut, pressed && styles.pressed]}
        >
          <Text style={styles.hostShortcutText}>Host</Text>
        </Pressable>
      </View>

      <View style={styles.filterColumn}>
        <ChipRow
          label="Status"
          chips={STATUS_CHIPS}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <ChipRow
          label="Mode"
          chips={MODE_CHIPS}
          value={modeFilter}
          onChange={setModeFilter}
        />
        <ChipRow
          label="Sport"
          chips={SPORT_CHIPS}
          value={sportFilter}
          onChange={(v) => setSportFilter(v as SportFilter)}
        />
      </View>

      {isLoading && list.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={renderEmpty()}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.brand}
            />
          }
          renderItem={({ item }) => (
            <BattleCard
              event={item}
              onPress={() =>
                navigation.navigate('BattleDetail', { eventId: item.id })
              }
            />
          )}
        />
      )}
    </Screen>
  );
}

// ─── Filter chip row ─────────────────────────────────────────────────────────

interface ChipRowProps<V extends string> {
  label: string;
  chips: ReadonlyArray<{ value: V; label: string }>;
  value: V;
  onChange: (v: V) => void;
}

function ChipRow<V extends string>({ label, chips, value, onChange }: ChipRowProps<V>) {
  return (
    <View style={styles.chipRow}>
      <Text style={styles.chipRowLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {chips.map((c) => {
          const active = c.value === value;
          return (
            <Pressable
              key={c.value}
              onPress={() => onChange(c.value)}
              accessibilityRole="button"
              accessibilityLabel={`Filter ${label.toLowerCase()} by ${c.label}`}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Battle card ─────────────────────────────────────────────────────────────

interface BattleCardProps {
  event: EventSummary;
  onPress: () => void;
}

function BattleCard({ event, onPress }: BattleCardProps) {
  const isFull = event.status === 'full' || event.spotsLeft <= 0;
  const ctaLabel = event.hasJoined
    ? 'View'
    : isFull
      ? 'Full'
      : 'Join';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open battle ${event.title}`}
      testID={`battle-card-${event.id}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <ModeBadge mode={event.mode} />
        <Text style={styles.cardSport}>{sportLabelForBattle(event.sport)}</Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {event.title}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {formatEventWhen(event.startsAt)}
      </Text>
      <Text style={styles.cardMetaSecondary} numberOfLines={1}>
        {event.locationText}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.cardCount}>
          {event.participantCount}/{event.capacity} in
        </Text>
        <View
          style={[
            styles.cta,
            event.hasJoined && styles.ctaJoined,
            isFull && !event.hasJoined && styles.ctaFull,
          ]}
        >
          <Text
            style={[
              styles.ctaText,
              event.hasJoined && styles.ctaTextJoined,
              isFull && !event.hasJoined && styles.ctaTextFull,
            ]}
          >
            {ctaLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function ModeBadge({ mode }: { mode: EventMode }) {
  const isRanked = mode === 'ranked';
  return (
    <View
      style={[styles.modeBadge, isRanked ? styles.modeBadgeRanked : styles.modeBadgeCasual]}
    >
      <Text
        style={[
          styles.modeBadgeText,
          isRanked ? styles.modeBadgeTextRanked : styles.modeBadgeTextCasual,
        ]}
      >
        {isRanked ? 'RANKED' : 'CASUAL'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  backText: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerEyebrow: {
    ...typography.label,
    color: colors.brand,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  hostShortcut: {
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  hostShortcutText: {
    ...typography.button,
    color: colors.textInverse,
  },
  filterColumn: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  chipRow: {
    gap: spacing.xs,
  },
  chipRowLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  chipScroll: {
    gap: spacing.xs,
    paddingRight: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    ...typography.button,
    fontSize: 13,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  separator: { height: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardSport: {
    ...typography.label,
    color: colors.textSecondary,
  },
  cardTitle: {
    ...typography.h3,
    fontSize: 18,
    color: colors.textPrimary,
  },
  cardMeta: {
    ...typography.body,
    color: colors.textPrimary,
  },
  cardMetaSecondary: {
    ...typography.body,
    color: colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  cardCount: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  cta: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
  },
  ctaText: {
    ...typography.button,
    fontSize: 13,
    color: colors.textInverse,
  },
  ctaJoined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.brand,
  },
  ctaTextJoined: {
    color: colors.brand,
  },
  ctaFull: {
    backgroundColor: colors.border,
  },
  ctaTextFull: {
    color: colors.textTertiary,
  },
  modeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  modeBadgeRanked: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  modeBadgeCasual: {
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  modeBadgeText: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  modeBadgeTextRanked: {
    color: colors.brand,
  },
  modeBadgeTextCasual: {
    color: colors.textSecondary,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  empty: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
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
  primaryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.textInverse,
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
  pressed: { opacity: 0.65 },
});
