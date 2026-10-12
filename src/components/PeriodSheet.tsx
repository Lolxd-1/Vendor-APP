import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { addDays, customPeriod, PRESETS, presetPeriod, rangeLabel, startOfDay, type Period } from '../domain/period';
import { Button } from '../ui/Button';
import { CalendarRange } from '../ui/CalendarRange';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

const Radio = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ checked: on }}
    accessibilityLabel={label}
    style={[styles.row, on && styles.rowOn]}>
    <Txt variant="body">{label}</Txt>
    {on && <Icon name="check" size={20} color={colors.blue} />}
  </Pressable>
);

// The inclusive last day of a custom period, as a calendar day.
const lastDayOf = (p: Period) => startOfDay(addDays(p.range.end, -1));

export const PeriodSheet = ({
  visible,
  value,
  now,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: Period;
  now: Date;
  onChange: (p: Period) => void;
  onClose: () => void;
}) => {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [first, setFirst] = useState<Date | null>(null);
  const [last, setLast] = useState<Date | null>(null);

  useEffect(() => {
    if (!visible) return;
    const custom = value.key === 'CUSTOM';
    setCalendarOpen(false);
    setFirst(custom ? startOfDay(value.range.start) : null);
    setLast(custom ? lastDayOf(value) : null);
  }, [visible, value]);

  const choose = (p: Period) => {
    onChange(p);
    onClose();
  };

  const hint = !first
    ? 'Pick the first day'
    : !last
      ? 'Pick the last day, or apply for one day'
      : rangeLabel(customPeriod(first, last).range);

  return (
    <Sheet visible={visible} onClose={onClose} title="Show orders from">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.rows} accessibilityRole="radiogroup">
          {PRESETS.map(p => (
            <Radio
              key={p.key}
              label={p.label}
              on={value.key === p.key}
              onPress={() => choose(presetPeriod(p.key, now))}
            />
          ))}
          <Radio label="Custom dates" on={calendarOpen || value.key === 'CUSTOM'} onPress={() => setCalendarOpen(true)} />
        </View>
        {calendarOpen && (
          <View style={styles.custom}>
            <CalendarRange
              first={first}
              last={last}
              today={now}
              onPick={(f, l) => {
                setFirst(f);
                setLast(l);
              }}
            />
            <Txt variant="footnote" color={colors.ink2} style={styles.hint}>
              {hint}
            </Txt>
            <Button
              label="Apply"
              size="l"
              disabled={!first}
              onPress={() => first && choose(customPeriod(first, last ?? first))}
            />
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  rows: { gap: space.s },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowOn: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  custom: { marginTop: space.l, gap: space.m },
  hint: { textAlign: 'center' },
});
