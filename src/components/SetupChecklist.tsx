import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { openSetting, type SettingKind, type SetupStatus } from '../native/vendor';
import { Button } from '../ui/Button';
import { colors, ui } from '../ui/theme';

const ITEMS: { key: keyof SetupStatus; kind: SettingKind; label: string }[] = [
  { key: 'notifications', kind: 'notifications', label: 'Allow notifications' },
  { key: 'fullScreen', kind: 'fullScreen', label: 'Allow full-screen order alerts' },
  { key: 'batteryUnrestricted', kind: 'battery', label: 'Let the app run in background (battery)' },
];

// Only what is missing is shown; when everything is fine this renders nothing.
export const SetupChecklist = ({ status }: { status: SetupStatus }) => {
  const missing = ITEMS.filter(i => !status[i.key]);
  if (missing.length === 0) return null;
  return (
    <View style={[ui.card, styles.box]}>
      <Text style={styles.head}>Orders may be missed — fix these:</Text>
      {missing.map(i => (
        <View key={i.key} style={[ui.row, styles.item]}>
          <Text style={[ui.text, styles.label]}>{i.label}</Text>
          <Button label="Fix" onPress={() => openSetting(i.kind)} compact />
        </View>
      ))}
      <Text style={[ui.muted, styles.hint]}>
        Xiaomi / Oppo / Vivo / Realme: also turn on Autostart for QuickVerse Vendor in App info.
      </Text>
      <Button label="Open App info" onPress={() => openSetting('appDetails')} outline compact />
    </View>
  );
};

const styles = StyleSheet.create({
  box: { borderColor: colors.warning, borderWidth: 2 },
  head: { fontWeight: '800', color: colors.warning, marginBottom: 6 },
  item: { justifyContent: 'space-between', marginTop: 8, gap: 8 },
  label: { flex: 1 },
  hint: { marginVertical: 10 },
});
