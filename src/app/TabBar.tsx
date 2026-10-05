import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../ui/Icon';
import { colors, space } from '../ui/theme';
import { Txt } from '../ui/Txt';
import type { TabKey } from './MainShell';

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'orders', label: 'Orders', icon: 'receipt-text' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'insights', label: 'Insights', icon: 'chart-column' },
  { key: 'account', label: 'Account', icon: 'store' },
];

export const TabBar = ({ tab, pending, onChange }: { tab: TabKey; pending: number; onChange: (t: TabKey) => void }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.xs) }]} accessibilityRole="tablist">
      {TABS.map(t => {
        const on = t.key === tab;
        const badge = t.key === 'orders' && pending > 0;
        const color = on ? colors.blue : colors.ink3;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={badge ? `${t.label}, ${pending} new` : t.label}
            style={styles.item}>
            <View>
              <Icon name={t.icon} size={24} color={color} />
              {badge && (
                <View style={styles.badge}>
                  <Txt variant="caption" color={colors.onColor} tabular>
                    {String(pending)}
                  </Txt>
                </View>
              )}
            </View>
            <Txt variant="caption" color={color}>
              {t.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  item: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 6 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
