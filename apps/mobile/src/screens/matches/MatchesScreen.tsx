import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../../components/Screen';
import { api } from '../../lib/api';
import { sportLabel } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PartnerSummary {
  userId: string;
  displayName: string;
  suburb?: string;
  sportProfiles: Array<{ sport: string; level: string }>;
}

interface Match {
  id: string;
  sport: string;
  status: string;
  createdAt: string;
  partner: PartnerSummary;
}

interface MatchListResponse {
  items: Match[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({ match }: { match: Match }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const sportLabelText = sportLabel(match.sport);
  const levelLabel = match.partner.sportProfiles.find((sp) => sp.sport === match.sport)?.level;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() =>
        navigation.navigate('Chat', {
          matchId: match.id,
          partnerName: match.partner.displayName,
          partnerId: match.partner.userId,
          sport: match.sport,
        })
      }
      accessibilityRole="button"
    >
      <View style={styles.cardAvatar}>
        <Text style={styles.cardAvatarText}>
          {match.partner.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{match.partner.displayName}</Text>
        {match.partner.suburb ? (
          <Text style={styles.cardSuburb}>{match.partner.suburb}</Text>
        ) : null}
        <View style={styles.sportBadge}>
          <Text style={styles.sportBadgeText}>
            {sportLabelText}
            {levelLabel ? ` · ${levelLabel.charAt(0).toUpperCase()}${levelLabel.slice(1)}` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function MatchesScreen() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<MatchListResponse>('/matches?limit=50');
      setMatches(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await api.get<MatchListResponse>('/matches?limit=50');
      setMatches(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Mutual interest</Text>
        <Text style={styles.title}>Matches</Text>
      </View>

      {isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={fetchMatches}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.centred}>
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptyBody}>
            Like someone and see if they like you back.{'\n'}Mutual likes become matches.
          </Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MatchCard match={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  eyebrow: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h2,
  },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    textAlign: 'center',
    color: colors.textSecondary,
    maxWidth: 260,
    lineHeight: 22,
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
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  cardAvatar: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textInverse,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardSuburb: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  sportBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
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
});
