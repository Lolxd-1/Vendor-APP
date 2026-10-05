import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from './theme';
import { Txt } from './Txt';

interface Item<K extends string> {
  key: K;
  label: string;
  count?: number;
  /** Red count bubble: something here needs action now. */
  alert?: boolean;
}

// iOS-style segmented control: grey track, white thumb on the selected segment.
export const Segmented = <K extends string>({
  items,
  value,
  onChange,
}: {
  items: Item<K>[];
  value: K;
  onChange: (key: K) => void;
}) => (
  <View style={styles.track} accessibilityRole="tablist">
    {items.map(item => {
      const on = item.key === value;
      const hot = !!item.alert && (item.count ?? 0) > 0;
      return (
        <Pressable
          key={item.key}
          onPress={() => onChange(item.key)}
          accessibilityRole="tab"
          accessibilityState={{ selected: on }}
          accessibilityLabel={item.count === undefined ? item.label : `${item.label}, ${item.count}`}
          style={[styles.segment, on && styles.thumb]}>
          <Txt variant="callout" color={on ? colors.ink : colors.ink2} numberOfLines={1}>
            {item.label}
          </Txt>
          {item.count !== undefined && (
            <View style={[styles.count, hot ? styles.countHot : on ? styles.countOn : null]}>
              <Txt variant="caption" color={hot ? colors.onColor : colors.ink2} tabular>
                {String(item.count)}
              </Txt>
            </View>
          )}
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.track, borderRadius: radius.m, padding: 3 },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  thumb: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countOn: { backgroundColor: colors.bg },
  countHot: { backgroundColor: colors.red },
});
