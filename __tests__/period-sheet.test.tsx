import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { PeriodSheet } from '../src/components/PeriodSheet';
import { presetPeriod, type Period } from '../src/domain/period';
import { SearchField } from '../src/ui/SearchField';

const now = new Date(2026, 9, 14, 15, 30);

let r: ReactTestRenderer.ReactTestRenderer;
const onChange = jest.fn();
const onClose = jest.fn();

const show = async (value: Period = presetPeriod('TODAY', now)) => {
  await act(async () => {
    r = ReactTestRenderer.create(
      <PeriodSheet visible value={value} now={now} onChange={onChange} onClose={onClose} />,
    );
  });
};
const textOf = () => r.root.findAllByType(Text).map(t => [t.props.children].flat().join('')).join(' ');
const cell = (label: string) =>
  r.root.find(n => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === label);
const press = async (label: string) => act(async () => cell(label).props.onPress());

beforeEach(() => jest.clearAllMocks());
afterEach(async () => act(async () => r?.unmount()));

test('picking a preset reports it and closes', async () => {
  await show();
  await press('Yesterday');
  expect(onChange).toHaveBeenCalledTimes(1);
  const p: Period = onChange.mock.calls[0][0];
  expect(p.key).toBe('YESTERDAY');
  expect(p.range.start).toEqual(new Date(2026, 9, 13));
  expect(onClose).toHaveBeenCalled();
});

test('custom dates pick a first and last day', async () => {
  await show();
  await press('Custom dates');
  await press('6 October 2026');
  await press('9 October 2026');
  await press('Apply');
  const p: Period = onChange.mock.calls[0][0];
  expect(p.key).toBe('CUSTOM');
  expect(p.range).toEqual({ start: new Date(2026, 9, 6), end: new Date(2026, 9, 10) });
  expect(onClose).toHaveBeenCalled();
});

test('one tapped day applies as a single day', async () => {
  await show();
  await press('Custom dates');
  await press('8 October 2026');
  await press('Apply');
  expect(onChange.mock.calls[0][0].range).toEqual({ start: new Date(2026, 9, 8), end: new Date(2026, 9, 9) });
});

test('days after today cannot be picked', async () => {
  await show();
  await press('Custom dates');
  expect(cell('15 October 2026').props.accessibilityState.disabled).toBe(true);
  await press('15 October 2026');
  expect(cell('Apply').props.accessibilityState.disabled).toBe(true);
  await press('Apply');
  expect(onChange).not.toHaveBeenCalled();
});

test('tapping a day before the first restarts the range', async () => {
  await show();
  await press('Custom dates');
  await press('9 October 2026');
  await press('6 October 2026');
  await press('Apply');
  expect(onChange.mock.calls[0][0].range).toEqual({ start: new Date(2026, 9, 6), end: new Date(2026, 9, 7) });
});

test('month arrows move the calendar and stop at this month', async () => {
  await show();
  await press('Custom dates');
  expect(textOf()).toContain('October 2026');
  expect(cell('Next month').props.accessibilityState.disabled).toBe(true);
  await press('Previous month');
  expect(textOf()).toContain('September 2026');
});

test('the search field clears itself', async () => {
  const change = jest.fn();
  await act(async () => {
    r = ReactTestRenderer.create(<SearchField value="abc" onChange={change} placeholder="Search" />);
  });
  await press('Clear search');
  expect(change).toHaveBeenCalledWith('');
  await act(async () => r.update(<SearchField value="" onChange={change} placeholder="Search" />));
  expect(r.root.findAll(n => n.props?.accessibilityLabel === 'Clear search')).toHaveLength(0);
});
