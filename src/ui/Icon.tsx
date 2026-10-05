import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { ICONS } from './iconMap';
import { colors } from './theme';

export type IconName = keyof typeof ICONS;

// Lucide line icons drawn from the bundled QVIcons font: one glyph per icon, no SVG library needed.
export const Icon = ({
  name,
  size = 22,
  color = colors.ink,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) => (
  <Text
    allowFontScaling={false}
    accessible={false}
    importantForAccessibility="no"
    style={[styles.glyph, { fontSize: size, lineHeight: size, color }, style]}>
    {ICONS[name]}
  </Text>
);

const styles = StyleSheet.create({
  glyph: { fontFamily: 'QVIcons', includeFontPadding: false },
});
