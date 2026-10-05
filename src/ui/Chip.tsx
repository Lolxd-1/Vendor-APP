import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon, type IconName } from './Icon';
import { colors, radius } from './theme';
import { Txt } from './Txt';

// Filter chip: one tap selects it (History time and status filters).
export const Chip = ({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: !!selected }}
    style={({ pressed }) => [styles.chip, selected && styles.on, pressed && styles.pressed]}>
    {icon && <Icon name={icon} size={16} color={selected ? colors.onColor : colors.ink2} />}
    <Txt variant="callout" color={selected ? colors.onColor : colors.ink}>
      {label}
    </Txt>
  </Pressable>
);

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  on: { backgroundColor: colors.blue, borderColor: colors.blue },
  pressed: { opacity: 0.75 },
});
