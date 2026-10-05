import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Button } from '../src/ui/Button';
import { EmptyState } from '../src/ui/EmptyState';
import { Icon } from '../src/ui/Icon';
import { ICONS } from '../src/ui/iconMap';
import { Row } from '../src/ui/List';
import { Segmented } from '../src/ui/Segmented';
import { Sheet } from '../src/ui/Sheet';
import { Txt } from '../src/ui/Txt';

const render = async (el: React.ReactElement) => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(el);
  });
  return r;
};

const flatStyle = (node: ReactTestRenderer.ReactTestInstance) => Object.assign({}, ...[node.props.style].flat(Infinity));
const textOf = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map(t => [t.props.children].flat().join('')).join(' ');
const pressByLabel = async (r: ReactTestRenderer.ReactTestRenderer, label: string) => {
  const node = r.root.find(n => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');
  await act(async () => node.props.onPress());
};

test('Txt applies the bundled typeface for its variant', async () => {
  const r = await render(<Txt variant="title">Hi</Txt>);
  const t = r.root.findByType(Text);
  expect(t.props.children).toBe('Hi');
  expect(flatStyle(t).fontFamily).toBe('PlusJakartaSans-SemiBold');
});

test('Icon draws its glyph from the icon font', async () => {
  const r = await render(<Icon name="phone" />);
  const t = r.root.findByType(Text);
  expect(t.props.children).toBe(ICONS.phone);
  expect(flatStyle(t).fontFamily).toBe('QVIcons');
});

test('Button fires only when enabled, and shows a spinner when busy', async () => {
  const onPress = jest.fn();
  const r = await render(<Button label="Accept order" onPress={onPress} />);
  await pressByLabel(r, 'Accept order');
  expect(onPress).toHaveBeenCalledTimes(1);

  await act(async () => r.update(<Button label="Accept order" onPress={onPress} disabled />));
  const disabled = r.root.find(n => n.props.accessibilityLabel === 'Accept order' && n.props.accessibilityState);
  expect(disabled.props.accessibilityState.disabled).toBe(true);

  await act(async () => r.update(<Button label="Accept order" onPress={onPress} busy />));
  expect(r.root.findAllByType(ActivityIndicator)).toHaveLength(1);
});

test('Segmented shows counts and reports the chosen segment', async () => {
  const onChange = jest.fn();
  const r = await render(
    <Segmented
      items={[
        { key: 'PENDING', label: 'New', count: 2, alert: true },
        { key: 'READY_FOR_PICKUP', label: 'Ready', count: 0 },
      ]}
      value="PENDING"
      onChange={onChange}
    />,
  );
  expect(textOf(r)).toContain('New');
  expect(textOf(r)).toContain('2');
  await pressByLabel(r, 'Ready, 0');
  expect(onChange).toHaveBeenCalledWith('READY_FOR_PICKUP');
});

test('Row and EmptyState actions fire', async () => {
  const onRow = jest.fn();
  const onRetry = jest.fn();
  const r = await render(
    <>
      <Row title="Store timings" onPress={onRow} />
      <EmptyState icon="inbox" title="Nothing here" action={{ label: 'Try again', onPress: onRetry }} />
    </>,
  );
  await pressByLabel(r, 'Store timings');
  await pressByLabel(r, 'Try again');
  expect(onRow).toHaveBeenCalled();
  expect(onRetry).toHaveBeenCalled();
});

test('Sheet renders its content only while visible', async () => {
  const r = await render(
    <Sheet visible={false} onClose={jest.fn()} title="Reject order?">
      <Txt>Inside</Txt>
    </Sheet>,
  );
  expect(textOf(r)).not.toContain('Inside');
  await act(async () =>
    r.update(
      <Sheet visible onClose={jest.fn()} title="Reject order?">
        <Txt>Inside</Txt>
      </Sheet>,
    ),
  );
  expect(textOf(r)).toContain('Reject order?');
  expect(textOf(r)).toContain('Inside');
});
