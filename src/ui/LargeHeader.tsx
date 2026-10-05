import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { colors, space } from './theme';
import { Txt } from './Txt';

// iOS large-title header: big left-aligned title, optional back button above it and a right-hand slot.
export const LargeHeader = ({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
}) => (
  <View style={styles.wrap}>
    {onBack && (
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={styles.back}>
        <Icon name="chevron-left" size={24} color={colors.blue} />
        <Txt variant="body" color={colors.blue}>
          Back
        </Txt>
      </Pressable>
    )}
    <View style={styles.row}>
      <View style={styles.titles}>
        <Txt variant="largeTitle" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Txt>
        {typeof subtitle === 'string' ? (
          <Txt variant="callout" color={colors.ink2} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : (
          subtitle
        )}
      </View>
      {right}
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: space.m, backgroundColor: colors.bg },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -6, marginBottom: space.xs, minHeight: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  titles: { flex: 1, gap: 2 },
});
