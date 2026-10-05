import React, { useRef } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { dayTime, historyStatusInfo, money, paymentLabel } from '../domain/format';
import type { Order } from '../domain/order';
import { StatusPill } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <View style={styles.line}>
    <Txt variant={strong ? 'headline' : 'body'} color={strong ? colors.ink : colors.ink2} style={styles.flex}>
      {label}
    </Txt>
    <Txt variant={strong ? 'headline' : 'body'} tabular>
      {value}
    </Txt>
  </View>
);

// The full bill of a past order (History > tap a row).
export const OrderDetailsSheet = ({ order, onClose }: { order: Order | null; onClose: () => void }) => {
  // Keep showing the last order while the sheet slides away.
  const last = useRef(order);
  if (order) last.current = order;
  const o = last.current;
  if (!o) return null;

  const status = historyStatusInfo(o.state);
  const items = Array.isArray(o.orderItem) ? o.orderItem : [];
  const rider = o.deliveryPartnerDetails;

  return (
    <Sheet visible={!!order} onClose={onClose} title={`#${o.orderId}`}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.line}>
          <StatusPill label={status.label} tone={status.tone} icon={status.icon} />
          <Txt variant="footnote" color={colors.ink2}>
            {dayTime(o.creationTime, Date.now())}
          </Txt>
        </View>

        <View style={styles.block}>
          <Txt variant="headline">{o.customerName || 'Customer'}</Txt>
          <Txt variant="footnote" color={colors.ink2}>
            {paymentLabel(o.paymentMethod)}
          </Txt>
        </View>

        <View style={styles.block}>
          {items.length === 0 && (
            <Txt variant="body" color={colors.ink2}>
              No items listed
            </Txt>
          )}
          {items.map((it, i) => (
            <Line
              key={`${it.id}-${i}`}
              label={`${it.itemCount ?? 1} × ${it.name || 'Item'}`}
              value={typeof it.itemPrice === 'number' && typeof it.itemCount === 'number' ? money(it.itemPrice * it.itemCount) : ''}
            />
          ))}
        </View>

        <View style={styles.block}>
          <Line label="Items total" value={money(o.amountExcludingDeliveryFee)} strong />
          {typeof o.deliveryFee === 'number' && <Line label="Delivery fee" value={money(o.deliveryFee)} />}
          {typeof o.totalAmount === 'number' && <Line label="Customer paid" value={money(o.totalAmount)} />}
        </View>

        {typeof o.orderDescription === 'string' && o.orderDescription.trim() !== '' && (
          <View style={[styles.block, styles.note]}>
            <Icon name="message-square-text" size={18} color={colors.ink2} />
            <Txt variant="body" style={styles.flex}>
              {o.orderDescription.trim()}
            </Txt>
          </View>
        )}

        {!!rider?.name && (
          <View style={[styles.block, styles.line]}>
            <Icon name="bike" size={20} color={colors.blue} />
            <Txt variant="body" style={styles.flex}>
              {rider.name}
            </Txt>
            {!!rider.mobileNumber && (
              <Button
                label="Call"
                onPress={() => Linking.openURL(`tel:${rider.mobileNumber}`)}
                variant="secondary"
                size="s"
                icon="phone"
              />
            )}
          </View>
        )}
      </ScrollView>
      <Button label="Close" onPress={onClose} variant="ghost" />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  scroll: { maxHeight: 480 },
  content: { gap: space.m, paddingBottom: space.m },
  block: { gap: space.s, padding: space.m, borderRadius: radius.m, backgroundColor: colors.bg },
  note: { flexDirection: 'row' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.s, justifyContent: 'space-between' },
  flex: { flex: 1 },
});
