import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  combineToLocalDate,
  daysInMonth,
  firstWeekdayOfMonth,
  formatDateLabel,
  isPastDate,
  monthLabel,
  shiftMonth,
  toDateString,
  type DateString,
} from '../lib/sessionTime';
import { colors, radii, spacing, typography } from '../theme';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface CalendarPickerProps {
  /** Currently-selected date — drives initial visible month + selection ring. */
  selected: DateString;
  /** Called when the user taps a non-disabled day. */
  onSelect: (date: DateString) => void;
  /** Override the "today" reference — accepted for testability. */
  now?: Date;
}

/**
 * Month-grid calendar picker, banking-app style.
 *
 * - 7-column grid (Sun..Sat header).
 * - Header carries the visible month label + prev/next arrows.
 * - The visible month opens on `month-of(selected)` so reopening the
 *   picker after a future-date pick lands on that month, not today.
 * - Past days are visually de-emphasised AND non-pressable (v1 rule:
 *   no past-date proposals).
 * - Today and the currently-selected day each get a distinct visual
 *   treatment.
 */
export function CalendarPicker({ selected, onSelect, now = new Date() }: CalendarPickerProps) {
  const initial = useMemo(() => combineToLocalDate(selected, '00:00'), [selected]);
  const [visibleYear, setVisibleYear] = useState(initial.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(initial.getMonth());

  const todayStr = useMemo(() => toDateString(now), [now]);
  const selectedStr = selected;

  // Build the grid cells: leading blanks + each day of month + trailing blanks
  // so the grid is a clean N rows of 7. Trailing blanks are optional but
  // they keep the layout from "stepping" between months.
  const cells = useMemo(() => {
    const leading = firstWeekdayOfMonth(visibleYear, visibleMonth);
    const total = daysInMonth(visibleYear, visibleMonth);
    const out: Array<{ key: string; date?: DateString; day?: number }> = [];
    for (let i = 0; i < leading; i++) {
      out.push({ key: `lead-${i}` });
    }
    for (let day = 1; day <= total; day++) {
      const d = new Date(visibleYear, visibleMonth, day);
      out.push({ key: `day-${day}`, date: toDateString(d), day });
    }
    // Pad to a multiple of 7 so the bottom row is always full-width.
    while (out.length % 7 !== 0) {
      out.push({ key: `trail-${out.length}` });
    }
    return out;
  }, [visibleYear, visibleMonth]);

  const handlePrevMonth = () => {
    const next = shiftMonth(visibleYear, visibleMonth, -1);
    setVisibleYear(next.year);
    setVisibleMonth(next.month);
  };

  const handleNextMonth = () => {
    const next = shiftMonth(visibleYear, visibleMonth, 1);
    setVisibleYear(next.year);
    setVisibleMonth(next.month);
  };

  // Disable the prev arrow when the visible month is in the past — there's
  // no reason to step backward into months whose every day is past.
  const visibleMonthEndStr = toDateString(
    new Date(visibleYear, visibleMonth, daysInMonth(visibleYear, visibleMonth))
  );
  const prevDisabled = visibleMonthEndStr <= todayStr;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={handlePrevMonth}
          disabled={prevDisabled}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={({ pressed }) => [
            styles.navButton,
            prevDisabled && styles.navButtonDisabled,
            pressed && !prevDisabled && styles.pressed,
          ]}
        >
          <Text
            style={[styles.navText, prevDisabled && styles.navTextDisabled]}
          >
            {'‹'}
          </Text>
        </Pressable>

        <Text style={styles.monthLabel}>{monthLabel(visibleYear, visibleMonth)}</Text>

        <Pressable
          onPress={handleNextMonth}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <Text style={styles.navText}>{'›'}</Text>
        </Pressable>
      </View>

      <View style={styles.weekHeaderRow}>
        {WEEKDAY_LABELS.map((d, i) => (
          <Text key={`wd-${i}`} style={styles.weekHeaderText}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          if (!cell.date) {
            return <View key={cell.key} style={styles.cell} />;
          }
          const isToday = cell.date === todayStr;
          const isSelected = cell.date === selectedStr;
          const isPast = isPastDate(cell.date, now);
          return (
            <Pressable
              key={cell.key}
              onPress={() => !isPast && onSelect(cell.date!)}
              disabled={isPast}
              accessibilityRole="button"
              accessibilityLabel={`Select ${formatDateLabel(cell.date)}`}
              accessibilityState={{ disabled: isPast, selected: isSelected }}
              style={({ pressed }) => [
                styles.cell,
                styles.dayCell,
                isToday && !isSelected && styles.dayCellToday,
                isSelected && styles.dayCellSelected,
                pressed && !isPast && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.dayText,
                  isToday && !isSelected && styles.dayTextToday,
                  isSelected && styles.dayTextSelected,
                  isPast && styles.dayTextPast,
                ]}
              >
                {cell.day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const CELL_SIZE = 40;
const ROW_GAP = 4;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navText: {
    fontSize: 26,
    color: colors.brand,
    lineHeight: 28,
  },
  navTextDisabled: {
    color: colors.textTertiary,
  },
  monthLabel: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  weekHeaderText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    width: CELL_SIZE,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: ROW_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_SIZE / 2,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: colors.brand,
  },
  dayCellSelected: {
    backgroundColor: colors.brand,
  },
  dayText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  dayTextToday: {
    color: colors.brand,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  dayTextPast: {
    color: colors.textTertiary,
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.65,
  },
});
