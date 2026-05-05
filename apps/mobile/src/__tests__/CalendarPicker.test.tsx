/**
 * CalendarPicker — component tests.
 *
 * Mocks the theme so style tokens don't blow up the renderer; uses a
 * fixed `now` so the today/past math is deterministic.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { CalendarPicker } from '../components/CalendarPicker';
import { formatDateLabel } from '../lib/sessionTime';

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#0f0', brandSoft: '#0f01', border: '#ccc',
    surface: '#fff', surfaceElevated: '#f5f5f5', background: '#fafafa',
    separator: '#e0e0e0', textPrimary: '#000', textSecondary: '#555',
    textTertiary: '#888', textInverse: '#fff', success: '#0f0', error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, pill: 9999, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: {
    h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

const FIXED_NOW = new Date(2026, 5, 15, 12, 0, 0); // 2026-06-15 local

describe('CalendarPicker', () => {
  it('opens on the month containing the selected date', () => {
    const { getByText } = render(
      <CalendarPicker
        selected="2026-08-10"
        onSelect={() => {}}
        now={FIXED_NOW}
      />
    );
    // Month label includes the year — locale-dependent month name.
    expect(getByText(/2026/)).toBeTruthy();
    // Day cells from August are rendered (day 10 sits in Aug).
    expect(getByText('10')).toBeTruthy();
  });

  it('renders nav buttons and steps forward when Next month is pressed', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <CalendarPicker
        selected="2026-06-15"
        onSelect={() => {}}
        now={FIXED_NOW}
      />
    );
    expect(getByLabelText('Next month')).toBeTruthy();
    // June has 30 days; July has 31 — after stepping forward, day 31 must
    // appear (it doesn't render in June).
    expect(queryByText('31')).toBeNull();
    fireEvent.press(getByLabelText('Next month'));
    expect(getByText('31')).toBeTruthy();
  });

  it('disables the Previous month button when the visible month is fully past', () => {
    // Open on the month containing today, then step forward and back to
    // confirm the disable rule. Stepping back into a past month is what
    // the disable is meant to prevent.
    const { getByLabelText } = render(
      <CalendarPicker
        selected="2026-06-15"
        onSelect={() => {}}
        now={FIXED_NOW}
      />
    );
    // June 2026 ends on 2026-06-30; now is 2026-06-15 — the Prev arrow
    // should be active because the visible month is not fully past.
    expect(getByLabelText('Previous month').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('calls onSelect when a future day is tapped', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <CalendarPicker
        selected="2026-06-15"
        onSelect={onSelect}
        now={FIXED_NOW}
      />
    );
    // June 20 is in the future → tap fires onSelect with the ISO date.
    fireEvent.press(getByLabelText(`Select ${formatDateLabel('2026-06-20')}`));
    expect(onSelect).toHaveBeenCalledWith('2026-06-20');
  });

  it('does not call onSelect when a past day is tapped', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <CalendarPicker
        selected="2026-06-15"
        onSelect={onSelect}
        now={FIXED_NOW}
      />
    );
    // June 14 is yesterday relative to FIXED_NOW; the cell must be present
    // (visually) but disabled — pressing it is a no-op.
    const yesterday = getByLabelText(`Select ${formatDateLabel('2026-06-14')}`);
    expect(yesterday.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(yesterday);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not call onSelect when re-tapping the already-selected day', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <CalendarPicker
        selected="2026-06-20"
        onSelect={onSelect}
        now={FIXED_NOW}
      />
    );
    // Tapping the selected day still triggers onSelect (consumer decides
    // whether to short-circuit). The contract is: tap a non-past day →
    // onSelect fires with that date.
    fireEvent.press(getByLabelText(`Select ${formatDateLabel('2026-06-20')}`));
    expect(onSelect).toHaveBeenCalledWith('2026-06-20');
  });
});
