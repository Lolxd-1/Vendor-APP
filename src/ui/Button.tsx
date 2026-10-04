import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from './theme';

interface Props {
  label: string;
  onPress: () => void;
  color?: string;
  outline?: boolean;
  busy?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

export const Button = ({ label, onPress, color = colors.primary, outline, busy, disabled, compact }: Props) => {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        outline ? { borderColor: color, backgroundColor: colors.card } : { backgroundColor: color, borderColor: color },
        (pressed || off) && styles.dim,
      ]}>
      {busy ? (
        <ActivityIndicator color={outline ? color : colors.onColor} />
      ) : (
        <Text style={[styles.label, { color: outline ? color : colors.onColor }]}>{label}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  compact: { paddingVertical: 8, paddingHorizontal: 12 },
  label: { fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.6 },
});
