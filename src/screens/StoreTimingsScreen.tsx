import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, ToastAndroid, View } from 'react-native';
import {
  DAYS,
  dayName,
  hhmmLabel,
  isAllDay,
  shiftHHMM,
  slotLabel,
  todayKey,
  type DayKey,
  type Week,
} from '../domain/schedule';
import type { StoreStatusApi } from '../hooks/useStoreStatus';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { Group, Row } from '../ui/List';
import { LargeHeader } from '../ui/LargeHeader';
import { Sheet } from '../ui/Sheet';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

type Mode = 'open' | 'closed' | 'hours';
const MODES: { key: Mode; label: string }[] = [
  { key: 'open', label: 'Open all day' },
  { key: 'closed', label: 'Closed all day' },
  { key: 'hours', label: 'Closed for some hours' },
];
const STEP = 30;

interface Draft {
  day: DayKey;
  mode: Mode;
  from: string;
  to: string;
}

const draftFor = (day: DayKey, week: Week): Draft => {
  const slot = week[day];
  if (!slot) return { day, mode: 'open', from: '14:00', to: '16:00' };
  if (isAllDay(slot)) return { day, mode: 'closed', from: '14:00', to: '16:00' };
  return { day, mode: 'hours', from: slot.openTime, to: slot.closeTime };
};

const apply = (week: Week, d: Draft): Week => {
  const next = { ...week };
  if (d.mode === 'open') delete next[d.day];
  else if (d.mode === 'closed') next[d.day] = { openTime: '00:00', closeTime: '00:00' };
  else next[d.day] = { openTime: d.from, closeTime: d.to };
  return next;
};

export const StoreTimingsScreen = ({ store, onBack }: { store: StoreStatusApi; onBack: () => void }) => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [invalid, setInvalid] = useState('');
  const schedule = store.schedule;
  const today = todayKey(new Date());

  const save = async () => {
    if (!draft || !schedule) return;
    if (draft.mode === 'hours' && draft.from === draft.to) {
      setInvalid('Pick two different times.');
      return;
    }
    setInvalid('');
    if (await store.save(apply(schedule.week, draft))) {
      setDraft(null);
      ToastAndroid.show('Store timings saved', ToastAndroid.SHORT);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <LargeHeader title="Store timings" onBack={onBack} />
      <Txt variant="body" color={colors.ink2} style={styles.intro}>
        Set when your store is closed. Outside these hours, customers can order.
      </Txt>

      {schedule?.manualOffline && (
        <View style={styles.notice}>
          <Icon name="power" size={18} color={colors.red} />
          <Txt variant="callout" color={colors.red} style={styles.flex}>
            Your store is switched offline. Go online from the Orders screen to take orders.
          </Txt>
        </View>
      )}

      {!schedule && store.loading && <ActivityIndicator color={colors.blue} style={styles.spinner} />}
      {!schedule && !store.loading && (
        <EmptyState
          icon="wifi-off"
          title="Couldn't load store timings"
          body={store.error ?? undefined}
          action={{ label: 'Try again', onPress: store.reload }}
        />
      )}

      {schedule && (
        <Group title="Every week">
          {DAYS.map(day => (
            <Row
              key={day}
              icon="calendar-clock"
              iconTone={schedule.week[day] ? 'amber' : 'green'}
              title={day === today ? `${dayName(day)} (today)` : dayName(day)}
              subtitle={slotLabel(schedule.week[day])}
              onPress={() => {
                setInvalid('');
                setDraft(draftFor(day, schedule.week));
              }}
            />
          ))}
        </Group>
      )}

      <Sheet visible={!!draft} onClose={() => !store.busy && setDraft(null)} title={draft ? dayName(draft.day) : ''}>
        {draft && (
          <>
            <View style={styles.modes} accessibilityRole="radiogroup">
              {MODES.map(m => {
                const on = draft.mode === m.key;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => setDraft({ ...draft, mode: m.key })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={m.label}
                    style={[styles.mode, on && styles.modeOn]}>
                    <Txt variant="body">{m.label}</Txt>
                    {on && <Icon name="check" size={20} color={colors.blue} />}
                  </Pressable>
                );
              })}
            </View>
            {draft.mode === 'hours' && (
              <View style={styles.times}>
                <TimeStepper
                  label="Closed from"
                  value={draft.from}
                  onChange={from => setDraft({ ...draft, from })}
                />
                <TimeStepper label="Open again at" value={draft.to} onChange={to => setDraft({ ...draft, to })} />
              </View>
            )}
            {!!(invalid || store.error) && (
              <Txt variant="footnote" color={colors.red} style={styles.error}>
                {invalid || store.error}
              </Txt>
            )}
            <View style={styles.actions}>
              <Button label="Save" onPress={save} size="l" busy={store.busy} />
              <Button label="Cancel" onPress={() => setDraft(null)} variant="ghost" disabled={store.busy} />
            </View>
          </>
        )}
      </Sheet>
    </ScrollView>
  );
};

const TimeStepper = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <View style={styles.stepper}>
    <Txt variant="callout" color={colors.ink2} style={styles.flex}>
      {label}
    </Txt>
    <Pressable
      onPress={() => onChange(shiftHHMM(value, -STEP))}
      accessibilityRole="button"
      accessibilityLabel={`${label} earlier`}
      style={styles.round}>
      <Icon name="minus" size={20} color={colors.blue} />
    </Pressable>
    <Txt variant="headline" tabular style={styles.time}>
      {hhmmLabel(value)}
    </Txt>
    <Pressable
      onPress={() => onChange(shiftHHMM(value, STEP))}
      accessibilityRole="button"
      accessibilityLabel={`${label} later`}
      style={styles.round}>
      <Icon name="plus" size={20} color={colors.blue} />
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxl },
  intro: { paddingHorizontal: space.l },
  flex: { flex: 1 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    margin: space.l,
    marginBottom: 0,
    padding: space.m,
    borderRadius: radius.l,
    backgroundColor: colors.redSoft,
  },
  spinner: { marginVertical: space.xxl },
  modes: { gap: space.s },
  mode: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modeOn: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  times: { marginTop: space.l, gap: space.m },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: { minWidth: 84, textAlign: 'center' },
  error: { marginTop: space.m },
  actions: { marginTop: space.l, gap: space.s },
});
