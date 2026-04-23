import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radii, spacing, typography } from '../theme';

export type SelectOption = { value: string; label: string };

type Props = {
  label?: string;
  required?: boolean;
  value: string | null;
  placeholder?: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  modalTitle?: string;
  accessibilityLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Minimal bounded-choice picker used for Step 1 onboarding (birth year, suburb).
 * Trigger mimics the Input visual language so it fits the existing forms.
 * Opens a native Modal with a scrollable list; pass ``searchable`` to show a
 * filter input at the top for longer lists (e.g. suburbs).
 */
export function Select({
  label,
  required = false,
  value,
  placeholder = 'Select…',
  options,
  onChange,
  searchable = false,
  modalTitle,
  accessibilityLabel,
  containerStyle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!searchable || query.trim() === '') return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  function handleSelect(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? 'Open picker'}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <Text
          style={[
            styles.triggerText,
            selectedLabel ? styles.triggerTextFilled : styles.triggerTextPlaceholder,
          ]}
          numberOfLines={1}
        >
          {selectedLabel ?? placeholder}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHandle} />
            {modalTitle ? <Text style={styles.sheetTitle}>{modalTitle}</Text> : null}

            {searchable ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={colors.textTertiary}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search options"
              />
            ) : null}

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
            >
              {filtered.length === 0 ? (
                <Text style={styles.empty}>No matches</Text>
              ) : (
                filtered.map((item) => {
                  const isSelected = item.value === value;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => handleSelect(item.value)}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      style={({ pressed }) => [
                        styles.option,
                        isSelected && styles.optionSelected,
                        pressed && styles.optionPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  required: {
    color: colors.error,
  },
  trigger: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    minHeight: 52,
    justifyContent: 'center',
  },
  triggerPressed: {
    opacity: 0.7,
  },
  triggerText: {
    ...typography.bodyLarge,
  },
  triggerTextFilled: {
    color: colors.textPrimary,
  },
  triggerTextPlaceholder: {
    color: colors.textTertiary,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '75%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  option: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  optionSelected: {
    backgroundColor: colors.surfaceElevated,
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  optionTextSelected: {
    color: colors.accent,
    fontWeight: '600',
  },
  empty: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
