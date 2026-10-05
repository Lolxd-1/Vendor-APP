import type { TextStyle } from 'react-native';

// Blue & white, Apple-minimal. White text only ever sits on blue / green / red (all ≥ 4.5:1).
export const colors = {
  bg: '#F3F5F9',
  surface: '#FFFFFF',
  ink: '#0B1B34',
  ink2: '#55647A',
  ink3: '#8B97A9',
  line: '#E3E8F0',
  blue: '#1557FF',
  bluePressed: '#0E43CC',
  blueSoft: '#EAF0FF',
  blueSoftPressed: '#D9E4FF',
  green: '#0B7F58',
  greenPressed: '#086246',
  greenSoft: '#E6F5EE',
  red: '#D42A33',
  redPressed: '#B0222A',
  redSoft: '#FDECEC',
  amber: '#A85F00',
  amberSoft: '#FFF3DE',
  onColor: '#FFFFFF',
  scrim: 'rgba(11,27,52,0.45)',
  track: '#E8ECF3',
};

// Bundled in android/app/src/main/assets/fonts (scripts/make-fonts.py). Android picks a custom font by family name
// only, so the weight lives in the name and fontWeight is never set alongside these.
export const fonts = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
};

export type TextVariant = 'display' | 'largeTitle' | 'title' | 'headline' | 'body' | 'callout' | 'footnote' | 'caption';

export const type: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 46, letterSpacing: -1 },
  largeTitle: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  headline: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  callout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  footnote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 10, m: 14, l: 20, xl: 28, pill: 999 };

export type Tone = 'neutral' | 'blue' | 'green' | 'red' | 'amber';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.ink2, bg: colors.bg },
  blue: { fg: colors.blue, bg: colors.blueSoft },
  green: { fg: colors.green, bg: colors.greenSoft },
  red: { fg: colors.red, bg: colors.redSoft },
  amber: { fg: colors.amber, bg: colors.amberSoft },
};
