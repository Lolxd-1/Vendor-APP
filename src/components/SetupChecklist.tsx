import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { SetupStatus } from '../native/vendor';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

/** How many of the phone settings that ringing depends on are still off. */
export const missingSetup = (s: SetupStatus): number =>
  [s.notifications, s.fullScreen, s.batteryUnrestricted].filter(ok => !ok).length;

// Warning banner on the Orders screen; the full checklist lives on the Order alerts page. Renders nothing when fine.
export const SetupChecklist = ({ status, onFix }: { status: SetupStatus; onFix: () => void }) => {
  const missing = missingSetup(status);
  if (missing === 0) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Icon name="triangle-alert" size={22} color={colors.amber} />
      <View style={styles.texts}>
        <Txt variant="headline" color={colors.amber}>
          Orders may be missed
        </Txt>
        <Txt variant="footnote" color={colors.ink2}>
          {missing === 1 ? '1 phone setting needs fixing' : `${missing} phone settings need fixing`}
        </Txt>
      </View>
      <Button label="Fix" onPress={onFix} size="s" />
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    marginHorizontal: space.l,
    marginBottom: space.m,
    padding: space.m,
    borderRadius: radius.l,
    backgroundColor: colors.amberSoft,
  },
  texts: { flex: 1, gap: 2 },
});
