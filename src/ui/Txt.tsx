import React from 'react';
import { Text, type TextProps } from 'react-native';
import { colors, type, type TextVariant } from './theme';

interface Props extends TextProps {
  variant?: TextVariant;
  color?: string;
  /** Equal-width digits, so ticking timers don't jiggle. */
  tabular?: boolean;
}

// Every piece of text goes through here so the bundled typeface and scale always apply.
export const Txt = ({ variant = 'body', color = colors.ink, tabular, style, ...rest }: Props) => (
  <Text {...rest} style={[type[variant], { color }, tabular && { fontVariant: ['tabular-nums'] }, style]} />
);
