import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, ToastAndroid, View } from 'react-native';
import { ApiError } from '../api/client';
import { acceptOrder, handoverOrder, markOrderReady, rejectOrder } from '../api/endpoints';
import { DEFAULT_PREP_TIME, PREP_TIME_OPTIONS } from '../config';
import type { BoardEntry } from '../domain/board';
import { clockTime, money, paymentLabel, riderStatusLabel } from '../domain/format';
import type { Order } from '../domain/order';
import { canHandOver, riderOtp, riderStatusOf } from '../domain/orderRules';
import { elapsedLabel, formatDuration, parseServerTime, prepRemainingMs } from '../domain/time';
import { markLocal, pollNow, type LocalAction } from '../native/vendor';
import { StatusPill } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { useReducedMotion } from '../ui/useReducedMotion';
import { RejectSheet } from './RejectSheet';

/** Prep countdown for an accepted order: null when the accept time or prep time is unknown. */
const prepState = (entry: BoardEntry, now: number) => {
  const acceptedAt = entry.localAt ?? parseServerTime(entry.order.acceptedDate);
  const prepMin = entry.localPrep ?? entry.order.preparationTime;
  const left = prepRemainingMs(acceptedAt, prepMin, now);
  if (left === null || !prepMin) return null;
  return { left, late: left <= 0, done: Math.min(1, Math.max(0, 1 - left / (prepMin * 60_000))) };
};

export const OrderCard = memo(({ entry, now }: { entry: BoardEntry; now: number }) => {
  const { order, phase } = entry;
  const [prep, setPrep] = useState<number>(DEFAULT_PREP_TIME);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Backend first; the board moves only after the server said yes. Never auto-retried.
  const run = async (call: () => Promise<unknown>, local: LocalAction, failure: string, prepMinutes = 0, done = '') => {
    setBusy(true);
    setError('');
    let ok = false;
    try {
      await call();
      markLocal(order.orderId, local, prepMinutes);
      pollNow();
      ok = true;
    } catch (e) {
      setError(e instanceof ApiError && e.status !== null ? `${failure} (${e.message})` : failure);
      setBusy(false);
    }
    if (ok && done) ToastAndroid.show(done, ToastAndroid.SHORT);
  };

  const accept = () =>
    run(
      () => acceptOrder(order.orderId, prep),
      'ACCEPTED',
      // The server may have committed before the reply was lost (web I10): say so, and the order
      // keeps ringing until the next poll shows where it really is.
      'Accept failed — it may still have been accepted. Wait a few seconds before retrying.',
      prep,
      'Order accepted',
    );

  const reject = (reason: string) =>
    run(() => rejectOrder(order.orderId, reason), 'CLOSED', 'Reject failed. Try again.', 0, 'Order rejected');

  const timing = phase === 'ACCEPTED' ? prepState(entry, now) : null;
  const late = !!timing?.late;

  return (
    <View style={[styles.card, phase === 'PENDING' && styles.cardNew, late && styles.cardLate]}>
      {phase === 'PENDING' ? (
        <NewBand order={order} now={now} />
      ) : (
        <View style={styles.head}>
          <View style={styles.headRow}>
            <Txt variant="headline" style={styles.flex} numberOfLines={1}>
              #{order.orderId}
            </Txt>
            {phase === 'ACCEPTED' ? (
              <PrepPill timing={timing} />
            ) : (
              <StatusPill tone="green" icon="package-check" label={`Ready ${elapsedLabel(order.readyDate ?? entry.localAt, now)}`} />
            )}
          </View>
          {timing && (
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${Math.round(timing.done * 100)}%` }, late && styles.progressLate]}
              />
            </View>
          )}
          <Txt variant="footnote" color={colors.ink2}>
            Placed {clockTime(order.creationTime)}
          </Txt>
        </View>
      )}

      <View style={styles.body}>
        <Customer order={order} />
        <Items order={order} />
        {typeof order.orderDescription === 'string' && order.orderDescription.trim() !== '' && (
          <View style={styles.note}>
            <Icon name="message-square-text" size={18} color={colors.ink2} />
            <View style={styles.flex}>
              <Txt variant="caption" color={colors.ink2}>
                Note from customer
              </Txt>
              <Txt variant="body">{order.orderDescription.trim()}</Txt>
            </View>
          </View>
        )}
        {phase !== 'PENDING' && <Rider order={order} />}

        {phase === 'PENDING' && (
          <>
            <PrepStepper value={prep} onChange={setPrep} disabled={busy} />
            <Button label="Accept order" onPress={accept} size="l" busy={busy && !rejecting} disabled={busy} icon="check" />
            <Button label="Reject" onPress={() => setRejecting(true)} outline color={colors.red} disabled={busy} />
          </>
        )}

        {phase === 'ACCEPTED' && (
          <Button
            label="Mark food ready"
            onPress={() => run(() => markOrderReady(order.orderId), 'READY', 'Could not mark ready. Try again.', 0, 'Marked ready')}
            variant={late ? 'danger' : 'primary'}
            pulse={late}
            size="l"
            icon="package-check"
            busy={busy}
          />
        )}

        {phase === 'READY_FOR_PICKUP' && (
          <>
            <Button
              label="Hand over to rider"
              onPress={() => run(() => handoverOrder(order.orderId), 'CLOSED', 'Could not hand over. Try again.', 0, 'Handed over')}
              variant="success"
              size="l"
              icon="hand-platter"
              busy={busy}
              disabled={!canHandOver(order)}
            />
            {!canHandOver(order) && (
              <View style={styles.hint}>
                <Icon name="info" size={16} color={colors.ink2} />
                <Txt variant="footnote" color={colors.ink2}>
                  Unlocks when the rider reaches your shop.
                </Txt>
              </View>
            )}
          </>
        )}

        {!!error && !rejecting && (
          <View style={styles.hint} accessibilityLiveRegion="polite">
            <Icon name="triangle-alert" size={16} color={colors.red} />
            <Txt variant="footnote" color={colors.red} style={styles.flex}>
              {error}
            </Txt>
          </View>
        )}
      </View>

      {phase === 'PENDING' && (
        <RejectSheet
          visible={rejecting}
          busy={busy}
          error={error}
          onCancel={() => {
            setRejecting(false);
            setError('');
          }}
          onConfirm={reject}
        />
      )}
    </View>
  );
});

// The one loud element in the app: a blue band with a ticking "waiting since" timer.
const NewBand = ({ order, now }: { order: Order; now: number }) => {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);

  return (
    <View style={styles.band}>
      <View style={styles.headRow}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Icon name="bell-ring" size={22} color={colors.onColor} />
        </Animated.View>
        <Txt variant="headline" color={colors.onColor} style={styles.flex}>
          New order
        </Txt>
        <Txt variant="title" color={colors.onColor} tabular accessibilityLabel={`Waiting ${elapsedLabel(order.creationTime, now)}`}>
          {elapsedLabel(order.creationTime, now)}
        </Txt>
      </View>
      <View style={styles.headRow}>
        <Txt variant="footnote" color={colors.blueSoft} style={styles.flex} numberOfLines={1}>
          #{order.orderId}
        </Txt>
        <Txt variant="footnote" color={colors.blueSoft}>
          Placed {clockTime(order.creationTime)}
        </Txt>
      </View>
    </View>
  );
};

const PrepPill = ({ timing }: { timing: ReturnType<typeof prepState> }) => {
  if (!timing) return <StatusPill tone="amber" icon="chef-hat" label="Preparing" />;
  if (timing.late) return <StatusPill tone="red" icon="timer" label={`Late by ${formatDuration(-timing.left)}`} />;
  return (
    <StatusPill tone={timing.left <= 60_000 ? 'red' : 'amber'} icon="timer" label={`${formatDuration(timing.left)} left`} />
  );
};

const Customer = ({ order }: { order: Order }) => (
  <View style={styles.headRow}>
    <View style={styles.flex}>
      <Txt variant="headline" numberOfLines={1}>
        {order.customerName || 'Customer'}
      </Txt>
      <View style={styles.inline}>
        <Icon name="wallet" size={14} color={colors.ink2} />
        <Txt variant="footnote" color={colors.ink2}>
          {paymentLabel(order.paymentMethod)}
        </Txt>
      </View>
    </View>
    <Txt variant="title" tabular>
      {money(order.amountExcludingDeliveryFee)}
    </Txt>
  </View>
);

const Items = ({ order }: { order: Order }) => {
  const items = Array.isArray(order.orderItem) ? order.orderItem : [];
  return (
    <View style={styles.items}>
      {items.length === 0 && (
        <Txt variant="body" color={colors.ink2}>
          No items listed
        </Txt>
      )}
      {items.map((it, i) => (
        <View key={`${it.id}-${i}`} style={styles.itemRow}>
          <View style={styles.qty}>
            <Txt variant="callout" color={colors.blue} tabular>
              {String(it.itemCount ?? 1)}
            </Txt>
          </View>
          <Txt variant="body" style={styles.flex}>
            {it.name || 'Item'}
          </Txt>
          {typeof it.itemPrice === 'number' && typeof it.itemCount === 'number' && (
            <Txt variant="callout" color={colors.ink2} tabular>
              {money(it.itemPrice * it.itemCount)}
            </Txt>
          )}
        </View>
      ))}
    </View>
  );
};

const Rider = ({ order }: { order: Order }) => {
  const status = riderStatusOf(order);
  const arrived = canHandOver(order);
  const name = order.deliveryPartnerDetails?.name;
  const phone = order.deliveryPartnerDetails?.mobileNumber;
  return (
    <View style={styles.rider}>
      <View style={styles.headRow}>
        <View style={[styles.riderIcon, arrived && styles.riderIconHere]}>
          <Icon name="bike" size={20} color={arrived ? colors.green : colors.blue} />
        </View>
        <View style={styles.flex}>
          <Txt variant="headline" numberOfLines={1}>
            {name || 'Finding a rider'}
          </Txt>
          <Txt variant="footnote" color={arrived ? colors.green : colors.ink2}>
            {name || status ? riderStatusLabel(status) : 'A rider will be assigned soon'}
          </Txt>
        </View>
        {!!phone && (
          <Button label="Call" onPress={() => Linking.openURL(`tel:${phone}`)} variant="secondary" size="s" icon="phone" />
        )}
      </View>
      <View style={styles.otpRow}>
        <Icon name="key-round" size={18} color={colors.ink2} />
        <Txt variant="callout" color={colors.ink2} style={styles.flex}>
          Rider OTP
        </Txt>
        <Txt variant="largeTitle" tabular style={styles.otp}>
          {riderOtp(order.orderId)}
        </Txt>
      </View>
    </View>
  );
};

const PrepStepper = ({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) => {
  const options: readonly number[] = PREP_TIME_OPTIONS;
  const at = Math.max(0, options.indexOf(value));
  const step = (d: number) => onChange(options[Math.min(options.length - 1, Math.max(0, at + d))]);
  return (
    <View style={styles.stepper}>
      <View style={styles.flex}>
        <Txt variant="callout" color={colors.ink2}>
          Ready in
        </Txt>
        <Txt variant="footnote" color={colors.ink3}>
          Cooking time you need
        </Txt>
      </View>
      <RoundButton icon="minus" label="Less time" onPress={() => step(-1)} disabled={disabled || at === 0} />
      <Txt variant="title" tabular style={styles.stepValue} accessibilityLiveRegion="polite">
        {`${value} min`}
      </Txt>
      <RoundButton icon="plus" label="More time" onPress={() => step(1)} disabled={disabled || at === options.length - 1} />
    </View>
  );
};

const RoundButton = ({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'minus' | 'plus';
  label: string;
  onPress: () => void;
  disabled: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    hitSlop={6}
    style={({ pressed }) => [styles.round, pressed && styles.roundPressed, disabled && styles.off]}>
    <Icon name={icon} size={20} color={colors.blue} />
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.line,
    marginHorizontal: space.l,
    marginBottom: space.m,
    overflow: 'hidden',
  },
  cardNew: { borderColor: colors.blue, borderWidth: 2 },
  cardLate: { borderColor: colors.red, borderWidth: 2 },
  band: { backgroundColor: colors.blue, paddingHorizontal: space.l, paddingVertical: space.m, gap: space.xs },
  head: { paddingHorizontal: space.l, paddingTop: space.l, gap: space.s },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  flex: { flex: 1 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.amber },
  progressLate: { backgroundColor: colors.red },
  body: { padding: space.l, gap: space.m },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  items: {
    gap: space.s,
    paddingVertical: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  qty: {
    minWidth: 30,
    height: 30,
    borderRadius: 8,
    paddingHorizontal: 6,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { flexDirection: 'row', gap: space.s, padding: space.m, borderRadius: radius.m, backgroundColor: colors.bg },
  rider: { gap: space.m, padding: space.m, borderRadius: radius.m, backgroundColor: colors.bg },
  riderIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  riderIconHere: { backgroundColor: colors.greenSoft },
  otpRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  otp: { letterSpacing: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  stepValue: { minWidth: 72, textAlign: 'center' },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundPressed: { backgroundColor: colors.blueSoft },
  off: { opacity: 0.35 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
