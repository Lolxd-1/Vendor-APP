import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { colors, radius } from './theme';
import { Txt } from './Txt';
import { useReducedMotion } from './useReducedMotion';

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: 'l' | 'm' | 's';
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  /** Breathes to pull the eye (Zomato's late "food ready" button). */
  pulse?: boolean;
  /** Custom color; with `outline`, a white button with a colored border and label (e.g. red Reject). */
  color?: string;
  outline?: boolean;
}

const FILLS: Record<Variant, { bg: string; pressed: string; fg: string }> = {
  primary: { bg: colors.blue, pressed: colors.bluePressed, fg: colors.onColor },
  secondary: { bg: colors.blueSoft, pressed: colors.blueSoftPressed, fg: colors.blue },
  danger: { bg: colors.red, pressed: colors.redPressed, fg: colors.onColor },
  success: { bg: colors.green, pressed: colors.greenPressed, fg: colors.onColor },
  ghost: { bg: 'transparent', pressed: colors.blueSoft, fg: colors.blue },
};

const HEIGHT = { l: 56, m: 48, s: 36 };

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  size = 'm',
  icon,
  busy,
  disabled,
  pulse,
  color,
  outline,
}: Props) => {
  const off = !!(disabled || busy);
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse || reduced || off) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.72, duration: 550, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced, off, opacity]);

  const fill = FILLS[variant];
  const custom = color ?? null;
  const bg = outline ? colors.surface : custom ?? fill.bg;
  const fg = outline ? custom ?? colors.blue : custom ? colors.onColor : fill.fg;
  const h = HEIGHT[size];

  return (
    <Animated.View style={{ opacity }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: off, busy: !!busy }}
        onPress={onPress}
        disabled={off}
        style={({ pressed }) => [
          styles.base,
          { minHeight: h, paddingHorizontal: h >= HEIGHT.m ? 20 : 14, backgroundColor: bg },
          outline && { borderWidth: 1.5, borderColor: fg },
          pressed && !outline && !custom && { backgroundColor: fill.pressed, transform: [{ scale: 0.98 }] },
          pressed && (outline || custom) && styles.pressedDim,
          off && styles.off,
        ]}>
        {busy ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={styles.row}>
            {icon && <Icon name={icon} size={h >= HEIGHT.m ? 20 : 16} color={fg} />}
            <Txt variant={h >= HEIGHT.m ? 'headline' : 'callout'} color={fg} numberOfLines={1}>
              {label}
            </Txt>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  base: { borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pressedDim: { opacity: 0.7 },
  off: { opacity: 0.4 },
});
