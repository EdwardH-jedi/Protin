/**
 * WheelPicker — component tests.
 *
 * Tap path is what the tests exercise (tap-an-off-center-row); the
 * snap-scroll path is exercised by real-device QA. Both are equivalent
 * from the consumer's perspective — the wheel reports onChange either
 * way.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { WheelPicker } from '../components/WheelPicker';

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

const ITEMS = [0, 1, 2, 3, 4, 5];

describe('WheelPicker', () => {
  it('renders one row per item with the formatted label', () => {
    const { getByText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={() => {}}
        formatItem={(n) => `#${n}`}
      />
    );
    for (const n of ITEMS) {
      expect(getByText(`#${n}`)).toBeTruthy();
    }
  });

  it('uses "Set" as the default accessibility row prefix', () => {
    const { getByLabelText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={() => {}}
        formatItem={(n) => `${n}`}
      />
    );
    expect(getByLabelText('Set 3')).toBeTruthy();
  });

  it('honors a custom accessibility row prefix', () => {
    const { getByLabelText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={() => {}}
        formatItem={(n) => `${n}`}
        accessibilityRowLabelPrefix="Pick number"
      />
    );
    expect(getByLabelText('Pick number 3')).toBeTruthy();
  });

  it('calls onChange when a non-selected row is tapped', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={onChange}
        formatItem={(n) => `${n}`}
      />
    );
    fireEvent.press(getByLabelText('Set 4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('does not call onChange when the already-selected row is tapped', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={onChange}
        formatItem={(n) => `${n}`}
      />
    );
    fireEvent.press(getByLabelText('Set 2'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports the parent label as accessibilityLabel on the column', () => {
    const { getByLabelText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={() => {}}
        formatItem={(n) => `${n}`}
        accessibilityLabel="My wheel"
      />
    );
    expect(getByLabelText('My wheel')).toBeTruthy();
  });
});
