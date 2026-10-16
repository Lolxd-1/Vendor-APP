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
// Day numbers must stay inside their 36 dp circle even with a large phone font.
// The circle view is never flattened away (collapsable false), so it keeps its round shape once selected.
const MAX_FONT_SCALE = 1.3;

const sameDay = (a: Date | null, b: Date) => !!a && a.getTime() === b.getTime();

// Rows of 7 so every day sits under its weekday (percentage widths can round a 7th cell onto the next row).
const weeksOf = (cells: (Date | null)[]): (Date | null)[][] => {
  const padded = [...cells, ...Array<null>((7 - (cells.length % 7)) % 7).fill(null)];
  return Array.from({ length: padded.length / 7 }, (_, w) => padded.slice(w * 7, w * 7 + 7));
};

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
  const weeks = weeksOf([...Array<null>(blanks).fill(null), ...days]);

  const move = (delta: number) => {
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const pick = (day: Date) => {
    if (first === null || last !== null) onPick(day, null);
    else if (day.getTime() >= first.getTime()) onPick(first, day);
    else onPick(day, null);
  };

  const renderDay = (day: Date | null, i: number) => {
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
        accessibilityRole="button"
        accessibilityLabel={`${day.getDate()} ${MONTH_NAMES[day.getMonth()]} ${day.getFullYear()}`}
        accessibilityState={{ selected: isEnd || between, disabled }}
        disabled={disabled}
        onPress={() => {
          if (!disabled) pick(day);
        }}
        style={[styles.cell, between && styles.band]}>
        <View collapsable={false} style={[styles.circle, isEnd && styles.circleOn]}>
          <Txt variant="callout" color={fg} tabular maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {String(day.getDate())}
          </Txt>
        </View>
      </Pressable>
    );
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
        <Txt variant="headline" maxFontSizeMultiplier={MAX_FONT_SCALE}>{`${MONTH_NAMES[month.month]} ${month.year}`}</Txt>
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
      <View style={styles.week}>
        {WEEKDAY_LETTERS.map((w, i) => (
          <View key={i} style={styles.weekday}>
            <Txt variant="caption" color={colors.ink3} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {w}
            </Txt>
          </View>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((day, i) => renderDay(day, w * 7 + i))}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.s },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  week: { flexDirection: 'row' },
  cell: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  weekday: { flex: 1, height: 24, alignItems: 'center', justifyContent: 'center' },
  band: { backgroundColor: colors.blueSoft },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  // The radius also travels with the colour: a day's circle is created when it is selected.
  circleOn: { backgroundColor: colors.blue, borderRadius: 18 },
});
