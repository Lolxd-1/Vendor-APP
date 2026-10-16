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
    <Txt variant="body" numberOfLines={1} style={styles.rowLabel}>
      {label}
    </Txt>
    {on && <Icon name="check" size={20} color={colors.blue} />}
  </Pressable>
);

// The inclusive last day of a custom period, as a calendar day.
const lastDayOf = (p: Period) => startOfDay(addDays(p.range.end, -1));

// Two pages in one sheet: the presets, and the calendar on its own page (under the presets it was pushed below
// the bottom edge of the sheet). Android back steps back from the calendar; tapping outside closes the sheet.
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
  const [page, setPage] = useState<'presets' | 'calendar'>('presets');
  const [first, setFirst] = useState<Date | null>(null);
  const [last, setLast] = useState<Date | null>(null);
  const custom = value.key === 'CUSTOM';

  useEffect(() => {
    if (!visible) return;
    setPage('presets');
    setFirst(custom ? startOfDay(value.range.start) : null);
    setLast(custom ? lastDayOf(value) : null);
  }, [visible, value, custom]);

  const choose = (p: Period) => {
    onChange(p);
    onClose();
  };

  const hint = !first
    ? 'Pick the first day'
    : !last
      ? 'Pick the last day, or apply for one day'
      : rangeLabel(customPeriod(first, last).range);

  const onCalendar = page === 'calendar';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onBack={onCalendar ? () => setPage('presets') : undefined}
      title={onCalendar ? 'Custom dates' : 'Show orders from'}>
      {onCalendar ? (
        <>
          {/* Only the calendar scrolls; the hint and Apply stay on screen even in a 6-week month on a small phone. */}
          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            <Pressable
              onPress={() => setPage('presets')}
              accessibilityRole="button"
              accessibilityLabel="Back to periods"
              hitSlop={8}
              style={styles.back}>
              <Icon name="chevron-left" size={20} color={colors.blue} />
              <Txt variant="callout" color={colors.blue}>
                Periods
              </Txt>
            </Pressable>
            <CalendarRange
              first={first}
              last={last}
              today={now}
              onPick={(f, l) => {
                setFirst(f);
                setLast(l);
              }}
            />
          </ScrollView>
          <View style={styles.footer}>
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
        </>
      ) : (
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
            <Pressable
              onPress={() => setPage('calendar')}
              accessibilityRole="radio"
              accessibilityState={{ checked: custom }}
              accessibilityLabel="Custom dates"
              style={[styles.row, custom && styles.rowOn]}>
              <View style={styles.rowLabel}>
                <Txt variant="body" numberOfLines={1}>
                  Custom dates
                </Txt>
                {custom && (
                  <Txt variant="footnote" color={colors.ink2} numberOfLines={1}>
                    {value.label}
                  </Txt>
                )}
              </View>
              <Icon name="chevron-right" size={20} color={custom ? colors.blue : colors.ink3} />
            </Pressable>
          </View>
        </ScrollView>
      )}
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
    gap: space.s,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowOn: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  rowLabel: { flex: 1 },
  scroll: { flexShrink: 1 },
  footer: { gap: space.m, paddingTop: space.s },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 44 },
  hint: { textAlign: 'center' },
});
