import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { ChallengeStatusBadge } from '../../components/ChallengeStatusBadge';
import { useChallenges } from '../../hooks/useChallenges';
import { useAuthStore } from '../../stores/auth';
import { sportLabelForBattle } from '../../lib/events';
import { isChallengeTerminal, type ChallengeRead } from '../../lib/challenges';
import { colors, radii, spacing, typography } from '../../theme';
import type { ChallengeListScreenProps } from '../../navigation/types';

type SectionKey = 'incoming' | 'active' | 'done';

interface SectionSpec {
  key: SectionKey;
  title: string;
  emptyCopy: string;
}

const SECTIONS: SectionSpec[] = [
  {
    key: 'incoming',
    title: 'Awaiting your response',
    emptyCopy: 'No incoming challenges right now.',
  },
  {
    key: 'active',
    title: 'Active',
    emptyCopy: 'No active challenges. Accept an incoming one to start.',
  },
  {
    key: 'done',
    title: 'Done',
    emptyCopy: 'No completed challenges yet.',
  },
];

interface GroupedChallenges {
  incoming: ChallengeRead[];
  active: ChallengeRead[];
  done: ChallengeRead[];
}

function groupChallenges(
  items: ChallengeRead[],
  currentUserId: string | null
): GroupedChallenges {
  const incoming: ChallengeRead[] = [];
  const active: ChallengeRead[] = [];
  const done: ChallengeRead[] = [];

  for (const c of items) {
    if (isChallengeTerminal(c.status)) {
      done.push(c);
      continue;
    }
    if (c.status === 'accepted') {
      active.push(c);
      continue;
    }
    if (c.status === 'pending') {
      const isOpponent = currentUserId !== null && currentUserId === c.opponentUserId;
      if (isOpponent) {
        incoming.push(c);
      } else {
        active.push(c);
      }
    }
  }

  return { incoming, active, done };
}

export function ChallengeListScreen({ navigation }: ChallengeListScreenProps) {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { items, isLoading, error, refresh } = useChallenges();

  const grouped = useMemo(
    () => groupChallenges(items, currentUserId),
    [items, currentUserId]
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  if (isLoading && items.length === 0 && !error) {
    return (
      <Screen padded={false}>
        <Header onBack={() => navigation.goBack()} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (error && items.length === 0) {
    return (
      <Screen padded={false}>
        <Header onBack={() => navigation.goBack()} />
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Could not load challenges</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable
            onPress={() => void refresh()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading challenges"
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <Header onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
          />
        }
      >
        <Text style={styles.intro}>
          Challenge results are verified when both players submit matching
          outcomes.
        </Text>

        {SECTIONS.map((section) => (
          <Section
            key={section.key}
            title={section.title}
            emptyCopy={section.emptyCopy}
            items={grouped[section.key]}
            currentUserId={currentUserId}
            onOpen={(id) => navigation.navigate('ChallengeDetail', { challengeId: id })}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

interface HeaderProps {
  onBack: () => void;
}

function Header({ onBack }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Text style={styles.backText}>{'←'}</Text>
      </Pressable>
      <View style={styles.headerCenter}>
        <Text style={styles.headerEyebrow}>1-ON-1</Text>
        <Text style={styles.headerTitle}>Challenges</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

interface SectionProps {
  title: string;
  emptyCopy: string;
  items: ChallengeRead[];
  currentUserId: string | null;
  onOpen: (challengeId: string) => void;
}

function Section({ title, emptyCopy, items, currentUserId, onOpen }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyCopy}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              currentUserId={currentUserId}
              onPress={() => onOpen(c.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

interface ChallengeCardProps {
  challenge: ChallengeRead;
  currentUserId: string | null;
  onPress: () => void;
}

function ChallengeCard({ challenge, currentUserId, onPress }: ChallengeCardProps) {
  const isChallenger = currentUserId === challenge.challengerUserId;
  const roleLabel = isChallenger ? 'You challenged' : 'Challenged you';
  const sportLabel = sportLabelForBattle(challenge.sport);
  const when = formatChallengeWhen(challenge.createdAt);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open challenge in ${sportLabel}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardSport}>{sportLabel.toUpperCase()}</Text>
        <ChallengeStatusBadge status={challenge.status} />
      </View>
      <Text style={styles.cardRole}>{roleLabel}</Text>
      <Text style={styles.cardArea}>{challenge.area}</Text>
      <Text style={styles.cardMeta}>{when}</Text>
    </Pressable>
  );
}

function formatChallengeWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerSpacer: {
    width: 36,
  },
  headerEyebrow: {
    ...typography.label,
    color: colors.textTertiary,
    letterSpacing: 1.4,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.7,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  errorBox: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  retryText: {
    ...typography.button,
    color: colors.brand,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  intro: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  list: {
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  card: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardSport: {
    ...typography.label,
    color: colors.brand,
    letterSpacing: 1.2,
  },
  cardRole: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  cardArea: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  cardMeta: {
    ...typography.label,
    color: colors.textTertiary,
    letterSpacing: 0.6,
  },
});
