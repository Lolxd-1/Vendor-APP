import React, { memo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../api/client';
import { acceptOrder, handoverOrder, markOrderReady, rejectOrder } from '../api/endpoints';
import { DEFAULT_PREP_TIME, MIN_REJECT_REASON, PREP_TIME_OPTIONS } from '../config';
import type { BoardEntry } from '../domain/board';
import { canHandOver, isValidRejectReason, riderOtp, riderStatusOf } from '../domain/orderRules';
import { elapsedLabel, formatDuration, parseServerTime, prepRemainingMs } from '../domain/time';
import { markLocal, pollNow, type LocalAction } from '../native/vendor';
import { Button } from '../ui/Button';
import { colors, ui } from '../ui/theme';

const money = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? `₹${n.toFixed(2)}` : '--');

export const OrderCard = memo(({ entry, now }: { entry: BoardEntry; now: number }) => {
  const { order, phase } = entry;
  const [prep, setPrep] = useState<number>(DEFAULT_PREP_TIME);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Backend first; the board moves only after the server said yes. Never auto-retried.
  const run = async (call: () => Promise<unknown>, local: LocalAction, failure: string, prepMinutes = 0) => {
    setBusy(true);
    setError('');
    try {
      await call();
      markLocal(order.orderId, local, prepMinutes);
      pollNow();
    } catch (e) {
      setError(e instanceof ApiError && e.status !== null ? `${failure} (${e.message})` : failure);
      setBusy(false);
    }
  };

  const accept = () =>
    run(
      () => acceptOrder(order.orderId, prep),
      'ACCEPTED',
      // The server may have committed before the reply was lost (web I10): say so, and the order
      // keeps ringing until the next poll shows where it really is.
      'Accept failed — it may still have been accepted. Wait a few seconds before retrying.',
      prep,
    );

  const reject = () => {
    if (!isValidRejectReason(reason, MIN_REJECT_REASON)) {
      setError(`Reason must be at least ${MIN_REJECT_REASON} characters.`);
      return;
    }
    run(() => rejectOrder(order.orderId, reason.trim()), 'CLOSED', 'Reject failed. Try again.');
  };

  const items = Array.isArray(order.orderItem) ? order.orderItem : [];
  const riderStatus = riderStatusOf(order);
  const riderName = order.deliveryPartnerDetails?.name;
  const riderPhone = order.deliveryPartnerDetails?.mobileNumber;

  return (
    <View style={[ui.card, phase === 'PENDING' && styles.pendingCard]}>
      <View style={[ui.row, styles.between]}>
        <Text style={ui.title}>#{order.orderId}</Text>
        {phase === 'PENDING' && <Text style={styles.newBadge}>NEW · {elapsedLabel(order.creationTime, now)}</Text>}
        {phase === 'ACCEPTED' && <AcceptedTimer entry={entry} now={now} />}
        {phase === 'READY_FOR_PICKUP' && (
          <Text style={styles.readyBadge}>Ready {elapsedLabel(order.readyDate ?? entry.localAt, now)}</Text>
        )}
      </View>

      <View style={[ui.row, styles.between, styles.gap]}>
        <Text style={ui.text}>{order.customerName || 'Customer'}</Text>
        <Text style={styles.amount}>{money(order.amountExcludingDeliveryFee)}</Text>
      </View>

      <View style={styles.items}>
        {items.map((it, i) => (
          <View key={`${it.id}-${i}`} style={[ui.row, styles.between]}>
            <Text style={[ui.text, styles.itemName]}>
              {it.itemCount} × {it.name}
            </Text>
            <Text style={ui.muted}>
              {typeof it.itemPrice === 'number' ? money(it.itemPrice * it.itemCount) : ''}
            </Text>
          </View>
        ))}
      </View>

      {phase !== 'PENDING' && (
        <View style={styles.rider}>
          <Text style={ui.muted}>
            Rider: {riderName || 'Waiting for rider'}
            {riderPhone ? ` · ${riderPhone}` : ''}
            {riderStatus ? ` · ${riderStatus.replace(/_/g, ' ')}` : ''}
          </Text>
          <Text style={styles.otp}>Rider OTP: {riderOtp(order.orderId)}</Text>
        </View>
      )}

      {phase === 'PENDING' && !rejecting && (
        <>
          <Text style={[ui.muted, styles.gap]}>Preparation time</Text>
          <View style={[ui.row, styles.chips]}>
            {PREP_TIME_OPTIONS.map(m => (
              <Text
                key={m}
                onPress={() => setPrep(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: prep === m }}
                style={[styles.chip, prep === m && styles.chipOn]}>
                {m}m
              </Text>
            ))}
          </View>
          <View style={styles.gap}>
            <Button label={`Accept · ${prep} min`} onPress={accept} color={colors.success} busy={busy} />
          </View>
          <View style={styles.gapSmall}>
            <Button label="Reject" onPress={() => setRejecting(true)} color={colors.danger} outline disabled={busy} />
          </View>
        </>
      )}

      {phase === 'PENDING' && rejecting && (
        <View style={styles.gap}>
          <TextInput
            style={ui.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Reason for rejecting"
            placeholderTextColor={colors.muted}
            editable={!busy}
          />
          <View style={[ui.row, styles.gap, styles.split]}>
            <View style={styles.flex}>
              <Button
                label="Cancel"
                onPress={() => {
                  setRejecting(false);
                  setReason('');
                  setError('');
                }}
                outline
                color={colors.muted}
                disabled={busy}
              />
            </View>
            <View style={styles.flex}>
              <Button label="Reject order" onPress={reject} color={colors.danger} busy={busy} />
            </View>
          </View>
        </View>
      )}

      {phase === 'ACCEPTED' && (
        <View style={styles.gap}>
          <Button
            label="Mark ready for pickup"
            onPress={() => run(() => markOrderReady(order.orderId), 'READY', 'Could not mark ready. Try again.')}
            busy={busy}
          />
        </View>
      )}

      {phase === 'READY_FOR_PICKUP' && (
        <View style={styles.gap}>
          <Button
            label="Mark handed over"
            onPress={() => run(() => handoverOrder(order.orderId), 'CLOSED', 'Could not hand over. Try again.')}
            busy={busy}
            disabled={!canHandOver(order)}
          />
          {!canHandOver(order) && <Text style={[ui.muted, styles.gapSmall]}>Available once the rider reaches your store.</Text>}
        </View>
      )}

      {!!error && <Text style={ui.error}>{error}</Text>}
    </View>
  );
});

const AcceptedTimer = ({ entry, now }: { entry: BoardEntry; now: number }) => {
  const acceptedAt = entry.localAt ?? parseServerTime(entry.order.acceptedDate);
  const left = prepRemainingMs(acceptedAt, entry.localPrep ?? entry.order.preparationTime, now);
  if (left === null) return <Text style={styles.prepBadge}>Accepted</Text>;
  const late = left <= 0;
  return (
    <Text style={[styles.prepBadge, (late || left <= 60_000) && styles.late]}>
      {late ? 'Time up — mark ready' : `${formatDuration(left)} left`}
    </Text>
  );
};

const styles = StyleSheet.create({
  pendingCard: { borderColor: colors.danger, borderWidth: 2 },
  between: { justifyContent: 'space-between' },
  gap: { marginTop: 12 },
  gapSmall: { marginTop: 8 },
  newBadge: { color: colors.danger, fontWeight: '800' },
  readyBadge: { color: colors.success, fontWeight: '700' },
  prepBadge: { color: colors.warning, fontWeight: '700' },
  late: { color: colors.danger },
  amount: { fontSize: 16, fontWeight: '800', color: colors.text },
  items: { marginTop: 8, gap: 4 },
  itemName: { flexShrink: 1, marginRight: 8 },
  rider: { marginTop: 10, gap: 2 },
  otp: { fontSize: 15, fontWeight: '800', color: colors.text },
  chips: { gap: 8, flexWrap: 'wrap', marginTop: 6 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.text,
    fontWeight: '700',
    overflow: 'hidden',
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primary, color: colors.onColor },
  split: { gap: 10 },
  flex: { flex: 1 },
});
