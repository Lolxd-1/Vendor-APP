import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { colors, space } from './theme';
import { Txt } from './Txt';

// Empty and error screens: say what is happening and what to do next.
export const EmptyState = ({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) => (
  <View style={styles.box}>
    <View style={styles.circle}>
      <Icon name={icon} size={30} color={colors.blue} />
    </View>
    <Txt variant="headline" style={styles.center}>
      {title}
    </Txt>
    {!!body && (
      <Txt variant="body" color={colors.ink2} style={styles.center}>
        {body}
      </Txt>
    )}
    {action && (
      <View style={styles.action}>
        <Button label={action.label} onPress={action.onPress} variant="secondary" icon="refresh-cw" />
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingHorizontal: space.xxl, paddingVertical: 56, gap: space.s },
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.s,
  },
  center: { textAlign: 'center' },
  action: { marginTop: space.m, alignSelf: 'stretch' },
});
