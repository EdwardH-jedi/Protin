import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { ChallengeStatusBadge } from '../../components/ChallengeStatusBadge';
import { useChallengeDetail } from '../../hooks/useChallenges';
import { sportLabelForBattle } from '../../lib/events';
import {
  isChallengeTerminal,
  type ChallengeRead,
} from '../../lib/challenges';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
import type { ChallengeDetailScreenProps } from '../../navigation/types';

type WinnerChoice = 'me' | 'opponent';

export function ChallengeDetailScreen({
  navigation,
  route,
}: ChallengeDetailScreenProps) {
  const { challengeId } = route.params;
  const {
    detail,
    isLoading,
    error,
    refresh,
    accept,
    decline,
    cancel,
    submitResult,
  } = useChallengeDetail({ challengeId });
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const [acting, setActing] = useState(false);
  const [winnerChoice, setWinnerChoice] = useState<WinnerChoice | null>(null);
  // The backend exposes "did I already submit" indirectly — once a
  // participant POSTs to /result, status stays "accepted" until the
  // other side submits. ChallengeRead alone cannot tell us. Track the
  // optimistic flag locally so the form collapses into the
  // "waiting for opponent" state without a second round-trip.
  const [submittedLocally, setSubmittedLocally] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isChallenger =
    currentUserId !== null && detail?.challengerUserId === currentUserId;
  const isOpponent =
    currentUserId !== null && detail?.opponentUserId === currentUserId;
  const isParticipant = isChallenger || isOpponent;

  const opponentId = useMemo(() => {
    if (!detail || !currentUserId) return null;
    return currentUserId === detail.challengerUserId
      ? detail.opponentUserId
      : detail.challengerUserId;
  }, [detail, currentUserId]);

  const handleAccept = useCallback(async () => {
    if (acting) return;
    setActing(true);
    try {
      await accept();
    } catch (err) {
      Alert.alert(
        "Couldn't accept this challenge.",
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setActing(false);
    }
  }, [acting, accept]);

  const handleDecline = useCallback(async () => {
    if (acting) return;
    setActing(true);
    try {
      await decline();
    } catch (err) {
      Alert.alert(
        "Couldn't decline this challenge.",
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setActing(false);
    }
  }, [acting, decline]);

  const handleCancel = useCallback(async () => {
    if (acting) return;
    setActing(true);
    try {
      await cancel();
    } catch (err) {
      Alert.alert(
        "Couldn't cancel this challenge.",
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setActing(false);
    }
  }, [acting, cancel]);

  const handleSubmitResult = useCallback(async () => {
    if (acting || !winnerChoice || !currentUserId || !opponentId) return;
    setSubmitError(null);
    setActing(true);
    const winnerUserId = winnerChoice === 'me' ? currentUserId : opponentId;
    const loserUserId = winnerChoice === 'me' ? opponentId : currentUserId;
    try {
      await submitResult({ winnerUserId, loserUserId });
      setSubmittedLocally(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not submit result.'
      );
    } finally {
      setActing(false);
    }
  }, [acting, winnerChoice, currentUserId, opponentId, submitResult]);

  if (isLoading && !detail) {
    return (
      <Screen padded={false}>
        <Header onBack={() => navigation.goBack()} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (error && !detail) {
    return (
      <Screen padded={false}>
        <Header onBack={() => navigation.goBack()} />
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Could not load challenge</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable
            onPress={() => void refresh()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading challenge"
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!detail) {
    return null;
  }

  const sportLabel = sportLabelForBattle(detail.sport);
  const terminal = isChallengeTerminal(detail.status);
  const youWonLabel = isChallenger ? 'Challenger' : 'Opponent';
  const theyWonLabel = isChallenger ? 'Opponent' : 'Challenger';

  return (
    <Screen padded={false}>
      <Header onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroRow}>
          <Text style={styles.hero}>{sportLabel.toUpperCase()}</Text>
          <ChallengeStatusBadge status={detail.status} />
        </View>

        <Text style={styles.area}>{detail.area}</Text>

        <View style={styles.metaBlock}>
          <MetaRow label="You are" value={isChallenger ? 'Challenger' : isOpponent ? 'Opponent' : 'Viewer'} />
          {detail.note ? <MetaRow label="Note" value={detail.note} /> : null}
          <MetaRow label="Created" value={formatChallengeWhen(detail.createdAt)} />
          {detail.acceptedAt ? (
            <MetaRow label="Accepted" value={formatChallengeWhen(detail.acceptedAt)} />
          ) : null}
          {detail.verifiedAt ? (
            <MetaRow label="Verified" value={formatChallengeWhen(detail.verifiedAt)} />
          ) : null}
        </View>

        {/* Status-driven section */}
        {detail.status === 'pending' && isOpponent && !terminal ? (
          <View style={styles.actionsBlock}>
            <Text style={styles.actionsTitle}>Respond to this challenge</Text>
            <Pressable
              onPress={handleAccept}
              disabled={acting}
              accessibilityRole="button"
              accessibilityLabel="Accept challenge"
              accessibilityState={{ disabled: acting }}
              style={({ pressed }) => [
                styles.primaryButton,
                acting && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Accept</Text>
            </Pressable>
            <Pressable
              onPress={handleDecline}
              disabled={acting}
              accessibilityRole="button"
              accessibilityLabel="Decline challenge"
              accessibilityState={{ disabled: acting }}
              style={({ pressed }) => [
                styles.secondaryButton,
                acting && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Decline</Text>
            </Pressable>
          </View>
        ) : null}

        {detail.status === 'pending' && isChallenger && !terminal ? (
          <View style={styles.actionsBlock}>
            <Text style={styles.waitingCopy}>
              Waiting for opponent to accept or decline.
            </Text>
            <Pressable
              onPress={handleCancel}
              disabled={acting}
              accessibilityRole="button"
              accessibilityLabel="Cancel challenge"
              accessibilityState={{ disabled: acting }}
              style={({ pressed }) => [
                styles.secondaryButton,
                acting && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Cancel challenge</Text>
            </Pressable>
          </View>
        ) : null}

        {detail.status === 'accepted' && isParticipant ? (
          submittedLocally ? (
            <View style={styles.statusBlock} accessibilityLabel="Awaiting opponent result">
              <Text style={styles.statusTitle}>Result submitted</Text>
              <Text style={styles.statusBody}>
                Waiting for your opponent to submit. Verified once both
                results match.
              </Text>
            </View>
          ) : (
            <ResultForm
              youWonLabel={youWonLabel}
              theyWonLabel={theyWonLabel}
              choice={winnerChoice}
              onChoose={setWinnerChoice}
              onSubmit={handleSubmitResult}
              submitting={acting}
              error={submitError}
            />
          )
        ) : null}

        {detail.status === 'verified' ? (
          <View style={styles.statusBlock} accessibilityLabel="Result verified">
            <Text style={styles.statusTitle}>Result verified</Text>
            <Text style={styles.statusBody}>
              Both players submitted matching results. This counted toward Honor
              and Rank.
            </Text>
          </View>
        ) : null}

        {detail.status === 'disputed' ? (
          <View style={styles.statusBlock} accessibilityLabel="Result disputed">
            <Text style={styles.statusTitle}>Result disputed</Text>
            <Text style={styles.statusBody}>
              The two submissions did not match. Honor and Rank are not
              changed for disputed challenges.
            </Text>
          </View>
        ) : null}

        {detail.status === 'declined' ? (
          <View style={styles.statusBlock} accessibilityLabel="Challenge declined">
            <Text style={styles.statusTitle}>Challenge declined</Text>
          </View>
        ) : null}

        {detail.status === 'cancelled' ? (
          <View style={styles.statusBlock} accessibilityLabel="Challenge cancelled">
            <Text style={styles.statusTitle}>Challenge cancelled</Text>
          </View>
        ) : null}

        {!isParticipant ? (
          <View style={styles.statusBlock}>
            <Text style={styles.statusTitle}>View only</Text>
            <Text style={styles.statusBody}>
              You are not a participant in this challenge.
            </Text>
          </View>
        ) : null}
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
        <Text style={styles.headerEyebrow}>CHALLENGE</Text>
        <Text style={styles.headerTitle}>Detail</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
}

function MetaRow({ label, value }: MetaRowProps) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

interface ResultFormProps {
  youWonLabel: string;
  theyWonLabel: string;
  choice: WinnerChoice | null;
  onChoose: (c: WinnerChoice) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}

function ResultForm({
  youWonLabel,
  theyWonLabel,
  choice,
  onChoose,
  onSubmit,
  submitting,
  error,
}: ResultFormProps) {
  return (
    <View style={styles.actionsBlock}>
      <Text style={styles.actionsTitle}>Submit result</Text>
      <Text style={styles.helpCopy}>
        Result is verified when both players submit matching results.
      </Text>

      <View style={styles.choiceRow}>
        <ChoicePill
          selected={choice === 'me'}
          onPress={() => onChoose('me')}
          label={`I won (${youWonLabel})`}
          accessibilityLabel="I won"
        />
        <ChoicePill
          selected={choice === 'opponent'}
          onPress={() => onChoose('opponent')}
          label={`They won (${theyWonLabel})`}
          accessibilityLabel="They won"
        />
      </View>

      {error ? (
        <Text style={styles.formError} accessibilityLabel="Submit result error">
          {error}
        </Text>
      ) : null}

      <Pressable
        onPress={onSubmit}
        disabled={submitting || choice === null}
        accessibilityRole="button"
        accessibilityLabel="Submit result"
        accessibilityState={{ disabled: submitting || choice === null }}
        style={({ pressed }) => [
          styles.primaryButton,
          (submitting || choice === null) && styles.buttonDisabled,
          pressed && choice !== null && styles.pressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {submitting ? 'Submitting...' : 'Submit result'}
        </Text>
      </Pressable>
    </View>
  );
}

interface ChoicePillProps {
  selected: boolean;
  onPress: () => void;
  label: string;
  accessibilityLabel: string;
}

function ChoicePill({ selected, onPress, label, accessibilityLabel }: ChoicePillProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.choicePill,
        selected && styles.choicePillActive,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.choicePillText,
          selected && styles.choicePillTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatChallengeWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
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
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hero: {
    ...typography.label,
    color: colors.brand,
    letterSpacing: 1.4,
  },
  area: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  metaBlock: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.separator,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  metaLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  metaValue: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  actionsBlock: {
    gap: spacing.sm,
  },
  actionsTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  helpCopy: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  waitingCopy: {
    ...typography.body,
    color: colors.textSecondary,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  choicePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choicePillActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  choicePillText: {
    ...typography.button,
    color: colors.textSecondary,
    fontSize: 13,
  },
  choicePillTextActive: {
    color: colors.brand,
  },
  primaryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  secondaryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  formError: {
    ...typography.bodySmall,
    color: colors.error,
  },
  statusBlock: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.xs,
  },
  statusTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  statusBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
