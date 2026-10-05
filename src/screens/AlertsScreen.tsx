import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, ToastAndroid, View } from 'react-native';
import type { Board } from '../domain/board';
import { openSetting, playTestSound, type SettingKind, type SetupStatus } from '../native/vendor';
import { StatusPill } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { IconName } from '../ui/Icon';
import { Group, Row } from '../ui/List';
import { LargeHeader } from '../ui/LargeHeader';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { connection } from './OrdersScreen';

const CHECKS: { key: keyof SetupStatus; kind: SettingKind; title: string; why: string; icon: IconName }[] = [
  { key: 'notifications', kind: 'notifications', title: 'Notifications', why: 'Shows new orders on screen', icon: 'bell' },
  { key: 'fullScreen', kind: 'fullScreen', title: 'Full-screen alerts', why: 'Wakes the locked screen', icon: 'smartphone' },
  {
    key: 'batteryUnrestricted',
    kind: 'battery',
    title: 'Battery: Unrestricted',
    why: 'Keeps the app awake in the background',
    icon: 'battery-charging',
  },
];

const checkedLabel = (lastPollAt: number, now: number): string => {
  if (!lastPollAt) return 'Not checked yet';
  const sec = Math.max(0, Math.round((now - lastPollAt) / 1000));
  return sec < 60 ? `Last checked ${sec} s ago` : `Last checked ${Math.floor(sec / 60)} min ago`;
};

// Everything that decides whether this phone rings, in one place.
export const AlertsScreen = ({ board, setup, onBack }: { board: Board; setup: SetupStatus; onBack: () => void }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const conn = connection(board);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <LargeHeader title="Order alerts" onBack={onBack} />

      <View style={styles.status}>
        <View style={styles.statusRow}>
          <StatusPill label={conn.label} tone={conn.tone} icon={conn.icon} />
          <Txt variant="footnote" color={colors.ink2}>
            {checkedLabel(board.lastPollAt, now)}
          </Txt>
        </View>
        <Txt variant="body">New orders ring loudly, even on Silent, until you accept or reject them.</Txt>
        <Button
          label="Play test sound"
          onPress={() => {
            playTestSound();
            ToastAndroid.show('Playing test sound', ToastAndroid.SHORT);
          }}
          variant="secondary"
          icon="volume-2"
        />
      </View>

      <Group title="Phone setup" footer="All three must be on, or orders can be missed when the screen is off.">
        {CHECKS.map(c => (
          <Row
            key={c.key}
            icon={c.icon}
            iconTone={setup[c.key] ? 'green' : 'red'}
            title={c.title}
            subtitle={c.why}
            right={
              setup[c.key] ? (
                <StatusPill label="On" tone="green" icon="check" />
              ) : (
                <Button label="Fix" onPress={() => openSetting(c.kind)} size="s" />
              )
            }
          />
        ))}
      </Group>

      <Group title="Xiaomi, Oppo, Vivo, Realme" footer="Also turn on Autostart for QuickVerse Vendor in App info.">
        <Row icon="settings" title="Open App info" onPress={() => openSetting('appDetails')} />
      </Group>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxl },
  status: {
    marginHorizontal: space.l,
    padding: space.l,
    gap: space.m,
    borderRadius: radius.l,
    backgroundColor: colors.surface,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
});
