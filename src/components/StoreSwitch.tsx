import React, { useState } from 'react';
import { Pressable, StyleSheet, ToastAndroid, View } from 'react-native';
import type { StoreStatusApi } from '../hooks/useStoreStatus';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

const FAILED = 'Could not change store status. Try again.';

// The Online/Offline pill in the Orders header (Swiggy/Zomato's "accepting orders" toggle).
export const StoreSwitch = ({ store, onOpenTimings }: { store: StoreStatusApi; onOpenTimings: () => void }) => {
  const [sheet, setSheet] = useState<'offline' | 'schedule' | null>(null);
  const [error, setError] = useState('');
  const { status, busy } = store;

  const press = async () => {
    if (busy) return;
    setError('');
    if (status.reason === 'schedule') return setSheet('schedule');
    if (status.online) return setSheet('offline');
    if (!(await store.setOnline(true))) ToastAndroid.show(FAILED, ToastAndroid.SHORT);
  };

  const goOffline = async () => {
    if (await store.setOnline(false)) setSheet(null);
    else setError(FAILED);
  };

  return (
    <>
      <Pressable
        onPress={press}
        accessibilityRole="switch"
        accessibilityState={{ checked: status.online, busy }}
        accessibilityLabel={status.online ? 'Store online' : 'Store offline'}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
        <Txt variant="callout" color={status.online ? colors.green : colors.red}>
          {busy ? 'Updating' : status.online ? 'Online' : 'Offline'}
        </Txt>
        <View style={[styles.track, status.online ? styles.trackOn : styles.trackOff]}>
          <View style={[styles.knob, status.online && styles.knobOn]} />
        </View>
      </Pressable>

      <Sheet visible={sheet === 'offline'} onClose={() => setSheet(null)} title="Go offline?">
        <Txt variant="body" color={colors.ink2}>
          Customers can't order from you until you go online again. Orders already placed will still ring.
        </Txt>
        {!!error && (
          <Txt variant="footnote" color={colors.red} style={styles.error}>
            {error}
          </Txt>
        )}
        <View style={styles.actions}>
          <Button label="Go offline" onPress={goOffline} variant="danger" size="l" busy={busy} />
          <Button label="Stay online" onPress={() => setSheet(null)} variant="ghost" disabled={busy} />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'schedule'} onClose={() => setSheet(null)} title="Closed by store timings">
        <Txt variant="body" color={colors.ink2}>
          Your store timings keep the store closed right now. To take orders, change today's timings.
        </Txt>
        <View style={styles.actions}>
          <Button
            label="Open store timings"
            onPress={() => {
              setSheet(null);
              onOpenTimings();
            }}
            size="l"
            icon="calendar-clock"
          />
          <Button label="Close" onPress={() => setSheet(null)} variant="ghost" />
        </View>
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  pill: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.7 },
  track: { width: 44, height: 26, borderRadius: 13, padding: 2, justifyContent: 'center' },
  trackOn: { backgroundColor: colors.green },
  trackOff: { backgroundColor: colors.line },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface },
  knobOn: { alignSelf: 'flex-end' },
  error: { marginTop: space.m },
  actions: { marginTop: space.xl, gap: space.s },
});
