import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { radius, toneColors, type Tone } from './theme';
import { Txt } from './Txt';

// A status always carries a word (and usually an icon), never color alone.
export const StatusPill = ({ label, tone, icon }: { label: string; tone: Tone; icon?: IconName }) => {
  const c = toneColors[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      {icon && <Icon name={icon} size={14} color={c.fg} />}
      <Txt variant="caption" color={c.fg} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
});
