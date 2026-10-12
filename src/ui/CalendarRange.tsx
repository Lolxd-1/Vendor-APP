import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { addDays, startOfDay } from '../domain/period';
import { Icon } from './Icon';
import { colors, space } from './theme';
import { Txt } from './Txt';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const sameDay = (a: Date | null, b: Date) => !!a && a.getTime() === b.getTime();

// One month at a time, Monday first; days after `today` are not pickable.
export const CalendarRange = ({
  first,
  last,
  today,
  onPick,
}: {
  first: Date | null;
  last: Date | null;
  today: Date;
  onPick: (first: Date | null, last: Date | null) => void;
}) => {
  const todayStart = startOfDay(today);
  const initial = last ?? first ?? todayStart;
  const [month, setMonth] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  const atThisMonth = month.year === todayStart.getFullYear() && month.month === todayStart.getMonth();
  const monthStart = new Date(month.year, month.month, 1);
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const blanks = (monthStart.getDay() + 6) % 7;
  const days = Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i));
  const cells: (Date | null)[] = [...Array<null>(blanks).fill(null), ...days];

  const move = (delta: number) => {
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const pick = (day: Date) => {
    if (first === null || last !== null) onPick(day, null);
    else if (day.getTime() >= first.getTime()) onPick(first, day);
    else onPick(day, null);
  };

  return (
    <View>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Previous month"
          hitSlop={8}
          onPress={() => move(-1)}
          style={styles.arrow}>
          <Icon name="chevron-left" size={22} />
        </Pressable>
        <Txt variant="headline">{`${MONTH_NAMES[month.month]} ${month.year}`}</Txt>
        <Pressable
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: atThisMonth }}
          disabled={atThisMonth}
          hitSlop={8}
          onPress={() => move(1)}
          style={[styles.arrow, atThisMonth && styles.off]}>
          <Icon name="chevron-right" size={22} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAY_LETTERS.map((w, i) => (
          <View key={i} style={styles.cell}>
            <Txt variant="caption" color={colors.ink3}>
              {w}
            </Txt>
          </View>
        ))}
        {cells.map((day, i) => {
          if (!day) return <View key={`b${i}`} style={styles.cell} />;
          const disabled = day.getTime() > todayStart.getTime();
          const isEnd = sameDay(first, day) || sameDay(last, day);
          const between =
            first !== null && last !== null && day.getTime() > first.getTime() && day.getTime() < last.getTime();
          const isToday = sameDay(todayStart, day);
          const fg = isEnd ? colors.onColor : disabled ? colors.ink3 : isToday ? colors.blue : colors.ink;
          return (
            <Pressable
              key={day.getTime()}
              accessibilityLabel={`${day.getDate()} ${MONTH_NAMES[day.getMonth()]} ${day.getFullYear()}`}
              accessibilityState={{ selected: isEnd || between, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!disabled) pick(day);
              }}
              style={[styles.cell, between && styles.band]}>
              <View style={[styles.circle, isEnd && styles.circleOn]}>
                <Txt variant="callout" color={fg}>
                  {String(day.getDate())}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.s },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  band: { backgroundColor: colors.blueSoft },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  circleOn: { backgroundColor: colors.blue },
});
