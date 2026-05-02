import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { TournamentCard } from '../../components/TournamentCard';
import { useTournaments } from '../../hooks/useTournaments';
import { colors, radii, spacing, typography } from '../../theme';
import type { TournamentsScreenProps } from '../../navigation/types';

type Tab = 'open' | 'mine';

export function TournamentsScreen({ navigation }: TournamentsScreenProps) {
  const [tab, setTab] = useState<Tab>('open');
  const { items, isLoading, error, available, refresh } = useTournaments({
    mine: tab === 'mine',
  });

  const renderEmpty = () => {
    if (!available) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Tournaments coming soon</Text>
          <Text style={styles.emptyBody}>
            This space is for organised play. We&apos;ll switch it on once enough Sydney
            partners are matching regularly.
          </Text>
        </View>
      );
    }
    if (tab === 'mine') {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>You haven&apos;t joined any tournaments</Text>
          <Text style={styles.emptyBody}>
            Browse Open tournaments and tap Join when one fits your schedule.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No open tournaments</Text>
        <Text style={styles.emptyBody}>Check back soon — new ones go up regularly.</Text>
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
          <Text style={styles.headerTitle}>Tournaments</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setTab('open')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'open' }}
          accessibilityLabel="Open tournaments"
          style={[styles.tabButton, tab === 'open' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, tab === 'open' && styles.tabTextActive]}>Open</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('mine')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'mine' }}
          accessibilityLabel="My tournaments"
          style={[styles.tabButton, tab === 'mine' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>My tournaments</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={refresh}
            accessibilityRole="button"
            accessibilityLabel="Retry loading tournaments"
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={renderEmpty()}
          renderItem={({ item }) => (
            <TournamentCard
              tournament={item}
              onPress={() =>
                navigation.navigate('TournamentDetail', { tournamentId: item.id })
              }
            />
          )}
        />
      )}
    </Screen>
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
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 32 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  tabText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textInverse,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  separator: { height: spacing.md },
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
  pressed: { opacity: 0.65 },
});
