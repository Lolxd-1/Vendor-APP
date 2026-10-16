import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { getAllOrders } from '../api/endpoints';
import { dayTime, money, paymentLabel } from '../domain/format';
import type { Order } from '../domain/order';
import { dayLabel, rangeLabel, rangeQuery, settlementWeek } from '../domain/period';
import { commissionLabel, DEFAULT_COMMISSION_PCT, payoutOf, shopCommissionPct, summarize } from '../domain/payout';
import { useRemote } from '../hooks/useRemote';
import { EmptyState } from '../ui/EmptyState';
import { StatusPill } from '../ui/Badge';
import { Icon } from '../ui/Icon';
import { LargeHeader } from '../ui/LargeHeader';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

const Line = ({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) => (
  <View style={styles.line}>
    <Txt variant={strong ? 'headline' : 'body'} color={strong ? colors.ink : colors.ink2} numberOfLines={2} style={styles.label}>
      {label}
    </Txt>
    <Txt variant={strong ? 'headline' : 'body'} color={color} tabular numberOfLines={1} style={styles.value}>
      {value}
    </Txt>
  </View>
);

const OrderCard = ({ order, pct, onOpen }: { order: Order; pct: number; onOpen: (o: Order) => void }) => {
  const p = payoutOf(order, pct);
  if (!p) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.orderId}, net receivable ${money(p.net)}`}
      onPress={() => onOpen(order)}
      style={styles.card}>
      <View style={styles.pillRow}>
        <View style={styles.pills}>
          <StatusPill label="Delivered" tone="green" icon="circle-check" />
          {p.settled ? (
            <StatusPill label="Settled" tone="green" icon="badge-check" />
          ) : (
            <StatusPill label="To be paid" tone="amber" icon="hourglass" />
          )}
        </View>
        <View style={styles.details}>
          <Txt variant="callout" color={colors.blue} numberOfLines={1}>
            Details
          </Txt>
          <Icon name="chevron-right" size={16} color={colors.blue} />
        </View>
      </View>
      <Txt variant="headline" numberOfLines={1}>{`ID: ${order.orderId}`}</Txt>
      <View style={styles.when}>
        <Icon name="calendar" size={14} color={colors.ink2} />
        <Txt variant="footnote" color={colors.ink2} numberOfLines={1} style={styles.label}>
          {`${dayTime(order.creationTime, Date.now())} · ${paymentLabel(order.paymentMethod)}`}
        </Txt>
      </View>
      <View style={styles.hairline} />
      <Line label="Gross revenue" value={money(p.gross)} />
      <Line label={commissionLabel(p)} value={money(-p.commission)} />
      {p.commissionGst > 0 && <Line label="GST on commission" value={money(-p.commissionGst)} />}
      <Line label="Net receivable" value={money(p.net)} strong />
    </Pressable>
  );
};

// Zomato-style payouts: one settlement week (Mon-Sun, paid the next Monday) and a card for each delivered order.
export const EarningsScreen = ({
  shopId,
  active,
  onOpenOrder,
}: {
  shopId: string;
  active: boolean;
  onOpenOrder: (o: Order, commissionPct?: number) => void;
}) => {
  const [offset, setOffset] = useState(0);
  const week = settlementWeek(new Date(), offset);
  const remote = useRemote(
    () => getAllOrders(shopId, { statuses: ['COMPLETED'], ...rangeQuery(week) }).then(res => ({ ...res, offset })),
    [shopId, offset],
  );
  const { reload } = remote;
  // Old data survives a reload of the same week only; another week's numbers are never shown.
  const data = remote.data?.offset === offset ? remote.data : null;

  // Fresh numbers every time the tab is opened (the first open is already loading).
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) reload();
    wasActive.current = active;
  }, [active, reload]);

  const orders = data?.orders;
  const sum = useMemo(() => (orders ? summarize(orders) : null), [orders]);
  const pct = useMemo(() => shopCommissionPct(orders ?? []) ?? DEFAULT_COMMISSION_PCT, [orders]);
  const cards = useMemo(() => (orders ?? []).filter(o => payoutOf(o, pct)), [orders, pct]);

  const range = rangeLabel(week);
  const title = offset === 0 ? 'This week' : offset === -1 ? 'Last week' : range;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={remote.loading && !!data} onRefresh={reload} colors={[colors.blue]} />}>
      <LargeHeader title="Earnings" />

      <View style={styles.weekBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          hitSlop={12}
          onPress={() => setOffset(o => o - 1)}
          style={styles.arrow}>
          <Icon name="chevron-left" size={24} color={colors.blue} />
        </Pressable>
        <View style={styles.weekTitle}>
          <Txt variant="headline" numberOfLines={1}>
            {title}
          </Txt>
          {title !== range && (
            <Txt variant="footnote" color={colors.ink2} numberOfLines={1}>
              {range}
            </Txt>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          accessibilityState={{ disabled: offset === 0 }}
          disabled={offset === 0}
          hitSlop={12}
          onPress={() => setOffset(o => Math.min(0, o + 1))}
          style={[styles.arrow, offset === 0 && styles.disabled]}>
          <Icon name="chevron-right" size={24} color={colors.blue} />
        </Pressable>
      </View>

      {!data && remote.loading && <ActivityIndicator color={colors.blue} style={styles.spinner} />}
      {!data && !remote.loading && remote.error && (
        <EmptyState
          icon="wifi-off"
          title="Couldn't load earnings"
          body={remote.error}
          action={{ label: 'Try again', onPress: reload }}
        />
      )}

      {sum && data && (
        <>
          <View style={styles.summary}>
            <Txt variant="callout" color={colors.ink2}>
              Net receivable
            </Txt>
            <Txt variant="display" tabular>
              {money(sum.net)}
            </Txt>
            <Txt variant="footnote" color={colors.ink2}>
              {`Payout on ${dayLabel(week.end)} · ${sum.orders} ${sum.orders === 1 ? 'order' : 'orders'}`}
            </Txt>
            <View style={styles.hairline} />
            <Line label="Gross revenue" value={money(sum.gross)} />
            <Line label="Commission" value={money(-sum.commission)} />
            {sum.commissionGst > 0 && <Line label="GST on commission" value={money(-sum.commissionGst)} />}
            <Line label="To be paid" value={money(sum.toBePaid)} color={colors.amber} />
            <Line label="Settled" value={money(sum.settled)} color={colors.green} />
            {sum.estimated && (
              <Txt variant="footnote" color={colors.ink2}>
                {`Commission is estimated at ${pct}% where QuickVerse did not send it.`}
              </Txt>
            )}
            {!data.complete && (
              <Txt variant="footnote" color={colors.ink2}>
                Showing the first 1,000 orders of {offset === 0 ? 'this' : 'the'} week
              </Txt>
            )}
          </View>
          {!!remote.error && (
            <Txt variant="footnote" color={colors.red} style={styles.stale}>
              {remote.error}
            </Txt>
          )}
          {!!remote.error && (
            <Txt variant="footnote" color={colors.red} style={styles.stale}>
              Showing the last numbers.
            </Txt>
          )}

          {cards.length === 0 ? (
            <EmptyState icon="wallet" title="No delivered orders in this week" />
          ) : (
            <>
              <Txt variant="title" style={styles.section} accessibilityRole="header">
                Orders
              </Txt>
              {cards.map(o => (
                <OrderCard key={o.orderId} order={o} pct={pct} onOpen={x => onOpenOrder(x, pct)} />
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxl },
  spinner: { marginVertical: space.xxl },
  weekBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.l, gap: space.m },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  weekTitle: { flex: 1, alignItems: 'center', minWidth: 0 },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    marginHorizontal: space.l,
    marginTop: space.m,
    padding: space.l,
    gap: space.s,
  },
  stale: { marginHorizontal: space.l, marginTop: space.s },
  section: { marginHorizontal: space.l, marginTop: space.xl, marginBottom: space.s },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    marginHorizontal: space.l,
    marginBottom: space.m,
    padding: space.l,
    gap: space.s,
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  pills: { flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', gap: space.s },
  details: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  when: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m },
  label: { flex: 1, minWidth: 0 },
  value: { flexShrink: 0 },
});
