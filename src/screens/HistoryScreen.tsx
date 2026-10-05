import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { getOrdersPage } from '../api/endpoints';
import { OrderDetailsSheet } from '../components/OrderDetailsSheet';
import { dayTime, historyStatusInfo, itemsSummary, money } from '../domain/format';
import { mergeOrders } from '../domain/history';
import type { HistoryStatus, Order, TimeRange } from '../domain/order';
import { errorText } from '../hooks/useRemote';
import { StatusPill } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { LargeHeader } from '../ui/LargeHeader';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

const TIMES: { key: TimeRange; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'LAST_WEEK', label: 'This week' },
  { key: 'THIS_MONTH', label: 'This month' },
];

const STATUSES: { label: string; statuses: HistoryStatus[] }[] = [
  { label: 'All', statuses: [] },
  { label: 'Delivered', statuses: ['COMPLETED'] },
  { label: 'On the way', statuses: ['IN_TRANSIT'] },
  { label: 'Rejected', statuses: ['REJECTED'] },
  { label: 'Cancelled', statuses: ['CANCELLED'] },
];

interface List {
  orders: Order[];
  page: number;
  totalPages: number;
}
const EMPTY: List = { orders: [], page: -1, totalPages: 0 };

export const HistoryScreen = ({ shopId }: { shopId: string }) => {
  const [time, setTime] = useState<TimeRange>('TODAY');
  const [status, setStatus] = useState(STATUSES[0]);
  const [list, setList] = useState<List>(EMPTY);
  const [loading, setLoading] = useState<'first' | 'more' | 'refresh' | null>('first');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const latest = useRef(0);

  // Only the newest request may write: quick filter taps never mix two filters' pages.
  const load = useCallback(
    async (page: number, mode: 'first' | 'more' | 'refresh') => {
      const id = ++latest.current;
      setLoading(mode);
      setError(null);
      try {
        const res = await getOrdersPage(shopId, { statuses: status.statuses, timeRange: time, page });
        if (id !== latest.current) return;
        setList(prev => ({
          orders: mergeOrders(page === 0 ? [] : prev.orders, res.orders),
          page,
          totalPages: res.totalPages,
        }));
      } catch (e) {
        if (id === latest.current) setError(errorText(e));
      } finally {
        if (id === latest.current) setLoading(null);
      }
    },
    [shopId, status, time],
  );

  useEffect(() => {
    setList(EMPTY);
    load(0, 'first');
  }, [load]);

  const hasMore = list.page + 1 < list.totalPages;
  const loadMore = () => {
    if (!loading && !error && hasMore) load(list.page + 1, 'more');
  };

  const empty =
    loading === 'first' ? (
      <ActivityIndicator color={colors.blue} style={styles.spinner} />
    ) : error ? (
      <EmptyState icon="wifi-off" title="Couldn't load orders" body={error} action={{ label: 'Try again', onPress: () => load(0, 'first') }} />
    ) : (
      <EmptyState icon="inbox" title="No orders in this period" body="Try a longer time range." />
    );

  return (
    <View style={styles.screen}>
      <LargeHeader
        title="History"
        subtitle={list.page >= 0 ? `${list.orders.length}${hasMore ? '+' : ''} orders` : 'Your past orders'}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {TIMES.map(t => (
          <Chip key={t.key} label={t.label} selected={t.key === time} onPress={() => setTime(t.key)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, styles.chipsLast]}>
        {STATUSES.map(s => (
          <Chip key={s.label} label={s.label} selected={s === status} onPress={() => setStatus(s)} />
        ))}
      </ScrollView>

      <FlatList
        data={list.orders}
        keyExtractor={o => o.orderId}
        renderItem={({ item }) => <HistoryRow order={item} onPress={() => setSelected(item)} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={loading === 'refresh'} onRefresh={() => load(0, 'refresh')} colors={[colors.blue]} />
        }
        ListEmptyComponent={empty}
        ListFooterComponent={
          loading === 'more' ? (
            <ActivityIndicator color={colors.blue} style={styles.spinner} />
          ) : error && list.orders.length > 0 ? (
            <View style={styles.footer}>
              <Txt variant="footnote" color={colors.red}>
                {error}
              </Txt>
              <Button label="Try again" onPress={() => load(list.page + 1, 'more')} variant="secondary" size="s" />
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
      />
      <OrderDetailsSheet order={selected} onClose={() => setSelected(null)} />
    </View>
  );
};

const HistoryRow = ({ order, onPress }: { order: Order; onPress: () => void }) => {
  const status = historyStatusInfo(order.state);
  const amount = money(order.amountExcludingDeliveryFee);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.orderId}, ${status.label}, ${amount}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowMain}>
        <Txt variant="headline" numberOfLines={1}>
          #{order.orderId}
        </Txt>
        <Txt variant="footnote" color={colors.ink2}>
          {dayTime(order.creationTime, Date.now())}
        </Txt>
        <Txt variant="footnote" color={colors.ink2} numberOfLines={1}>
          {itemsSummary(order.orderItem)}
        </Txt>
      </View>
      <View style={styles.rowSide}>
        <Txt variant="headline" tabular>
          {amount}
        </Txt>
        <StatusPill label={status.label} tone={status.tone} icon={status.icon} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  chips: { gap: space.s, paddingHorizontal: space.l, paddingBottom: space.s },
  chipsLast: { paddingBottom: space.m },
  list: { paddingHorizontal: space.l, paddingBottom: space.xl, gap: space.s, flexGrow: 1 },
  spinner: { marginVertical: space.xxl },
  footer: { alignItems: 'center', gap: space.s, paddingVertical: space.l },
  row: {
    flexDirection: 'row',
    gap: space.m,
    padding: space.l,
    borderRadius: radius.l,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.75 },
  rowMain: { flex: 1, gap: 2 },
  rowSide: { alignItems: 'flex-end', justifyContent: 'space-between', gap: space.s },
});
