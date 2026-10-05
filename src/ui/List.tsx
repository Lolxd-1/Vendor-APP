import React, { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { colors, radius, space, toneColors, type Tone } from './theme';
import { Txt } from './Txt';

// Grouped list in the style of iOS Settings: a white rounded block of rows with inset hairlines.
export const Group = ({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) => {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {!!title && (
        <Txt variant="callout" color={colors.ink2} style={styles.groupTitle} accessibilityRole="header">
          {title}
        </Txt>
      )}
      <View style={styles.block}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={styles.separator} />}
            {row}
          </Fragment>
        ))}
      </View>
      {!!footer && (
        <Txt variant="footnote" color={colors.ink2} style={styles.footer}>
          {footer}
        </Txt>
      )}
    </View>
  );
};

export const Row = ({
  icon,
  iconTone = 'blue',
  title,
  subtitle,
  value,
  onPress,
  right,
  danger,
  chevron,
}: {
  icon?: IconName;
  iconTone?: Tone;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  chevron?: boolean;
}) => {
  const tone = toneColors[danger ? 'red' : iconTone];
  const body = (
    <>
      {icon && (
        <View style={[styles.iconBox, { backgroundColor: tone.bg }]}>
          <Icon name={icon} size={18} color={tone.fg} />
        </View>
      )}
      <View style={styles.texts}>
        <Txt variant="body" color={danger ? colors.red : colors.ink}>
          {title}
        </Txt>
        {!!subtitle && (
          <Txt variant="footnote" color={colors.ink2}>
            {subtitle}
          </Txt>
        )}
      </View>
      {!!value && (
        <Txt variant="callout" color={colors.ink2} tabular style={styles.value} numberOfLines={2}>
          {value}
        </Txt>
      )}
      {right}
      {(chevron ?? !!onPress) && !danger && <Icon name="chevron-right" size={18} color={colors.ink3} />}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  group: { marginTop: space.xl, marginHorizontal: space.l },
  groupTitle: { marginBottom: space.s, marginLeft: space.xs },
  block: { backgroundColor: colors.surface, borderRadius: radius.l, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 56 },
  footer: { marginTop: space.s, marginHorizontal: space.xs },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.l, paddingVertical: space.m, gap: space.m },
  pressed: { backgroundColor: colors.bg },
  iconBox: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
  value: { maxWidth: '50%', textAlign: 'right' },
});
