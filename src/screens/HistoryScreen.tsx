import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { getOrdersPage } from '../api/endpoints';
import { PeriodSheet } from '../components/PeriodSheet';
import { clockTime, historyStatusInfo, itemsSummary, money } from '../domain/format';
import { mergeOrders } from '../domain/history';
import type { HistoryStatus, Order } from '../domain/order';
import { addDays, dayLabel, presetPeriod, queryOf, startOfDay, type Period } from '../domain/period';
import { parseServerTime } from '../domain/time';
import { errorText } from '../hooks/useRemote';
import { StatusPill } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { LargeHeader } from '../ui/LargeHeader';
import { SearchField } from '../ui/SearchField';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

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
  totalElements?: number;
}
const EMPTY: List = { orders: [], page: -1, totalPages: 0 };

interface Section {
  title: string;
  data: Order[];
}

const sectionTitle = (day: Date, today: Date): string => {
  if (day.getTime() === today.getTime()) return 'Today';
  if (day.getTime() === addDays(today, -1).getTime()) return 'Yesterday';
  return dayLabel(day);
};

// Orders arrive newest first, so each day's orders are adjacent; unreadable times go last.
const groupByDay = (orders: Order[], now: Date): Section[] => {
  const today = startOfDay(now);
  const days = new Map<number, Section>();
  const earlier: Order[] = [];
  for (const o of orders) {
    const ms = parseServerTime(o.creationTime);
    if (ms === null) {
      earlier.push(o);
      continue;
    }
    const day = startOfDay(new Date(ms));
    const section = days.get(day.getTime()) ?? { title: sectionTitle(day, today), data: [] };
    section.data.push(o);
    days.set(day.getTime(), section);
  }
  const sections = [...days.values()];
  if (earlier.length) sections.push({ title: 'Earlier', data: earlier });
  return sections;
};

const sectionSummary = (data: Order[]): string => {
  const delivered = data.reduce(
    (sum, o) => (o.state === 'COMPLETED' ? sum + (Number(o.amountExcludingDeliveryFee) || 0) : sum),
    0,
  );
  const count = `${data.length} ${data.length === 1 ? 'order' : 'orders'}`;
  return delivered > 0 ? `${count} · ${money(delivered)} delivered` : count;
};

export const HistoryScreen = ({ shopId, onOpenOrder }: { shopId: string; onOpenOrder: (o: Order) => void }) => {
  const [period, setPeriod] = useState<Period>(() => presetPeriod('TODAY', new Date()));
  const [status, setStatus] = useState(STATUSES[0]);
  const [query, setQuery] = useState('');
  const [list, setList] = useState<List>(EMPTY);
  const [loading, setLoading] = useState<'first' | 'more' | 'refresh' | null>('first');
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const latest = useRef(0);
  const failed = useRef<{ page: number; mode: 'first' | 'more' | 'refresh' }>({ page: 0, mode: 'first' });

  // Only the newest request may write: quick filter taps never mix two filters' pages.
  const load = useCallback(
    async (page: number, mode: 'first' | 'more' | 'refresh') => {
      const id = ++latest.current;
      setLoading(mode);
      setError(null);
      failed.current = { page, mode };
      try {
        const res = await getOrdersPage(shopId, { statuses: status.statuses, ...queryOf(period), page });
        if (id !== latest.current) return;
        setList(prev => ({
          orders: mergeOrders(page === 0 ? [] : prev.orders, res.orders),
          page,
          totalPages: res.totalPages,
          totalElements: res.totalElements,
        }));
      } catch (e) {
        if (id === latest.current) setError(errorText(e));
      } finally {
        if (id === latest.current) setLoading(null);
      }
    },
    [shopId, status, period],
  );

  useEffect(() => {
    setList(EMPTY);
    load(0, 'first');
  }, [load]);

  const hasMore = list.page + 1 < list.totalPages;
  const loadMore = () => {
    if (!loading && !error && hasMore) load(list.page + 1, 'more');
  };

  const needle = query.trim().toLowerCase();
  const sections = useMemo(() => {
    const shown = needle
      ? list.orders.filter(
          o => o.orderId.toLowerCase().includes(needle) || (o.customerName ?? '').toLowerCase().includes(needle),
        )
      : list.orders;
    return groupByDay(shown, new Date());
  }, [list.orders, needle]);

  const subtitle =
    list.page < 0
      ? 'Your past orders'
      : list.totalElements !== undefined
        ? `${list.totalElements} ${list.totalElements === 1 ? 'order' : 'orders'}`
        : `${list.orders.length}${hasMore ? '+' : ''} orders`;

  const empty =
    loading === 'first' ? (
      <View accessibilityLabel="Loading orders" style={styles.skeletons}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={styles.skeleton} />
        ))}
      </View>
    ) : error && list.orders.length === 0 ? (
      <EmptyState icon="wifi-off" title="Couldn't load orders" body={error} action={{ label: 'Try again', onPress: () => load(0, 'first') }} />
    ) : needle && list.orders.length > 0 ? (
      <View>
        <EmptyState icon="search" title={`No orders match "${query.trim()}"`} />
        {hasMore && !error && (
          <View style={styles.footer}>
            <Button label="Search older orders" onPress={() => load(list.page + 1, 'more')} variant="secondary" size="s" />
          </View>
        )}
      </View>
    ) : (
      <EmptyState icon="inbox" title="No orders in this period" body="Try a longer time range." />
    );

  return (
    <View style={styles.screen}>
      <LargeHeader title="History" subtitle={subtitle} />
      <View style={styles.search}>
        <SearchField value={query} onChange={setQuery} placeholder="Search order ID or customer" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chips}>
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Period: ${period.label}`}
          style={({ pressed }) => [styles.periodChip, pressed && styles.pressed]}>
          <Icon name="calendar" size={16} color={colors.ink2} />
          <Txt variant="callout" numberOfLines={1}>
            {period.label}
          </Txt>
          <Icon name="chevron-down" size={16} color={colors.ink2} />
        </Pressable>
        {STATUSES.map(s => (
          <Chip key={s.label} label={s.label} selected={s === status} onPress={() => setStatus(s)} />
        ))}
      </ScrollView>

      <SectionList
        sections={sections}
        stickySectionHeadersEnabled
        keyExtractor={o => o.orderId}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Txt variant="headline" numberOfLines={1}>
              {section.title}
            </Txt>
            <Txt variant="footnote" color={colors.ink2} numberOfLines={1} style={styles.sectionTotal}>
              {sectionSummary(section.data)}
            </Txt>
          </View>
        )}
        renderItem={({ item }) => <HistoryRow order={item} onPress={() => onOpenOrder(item)} />}
        ItemSeparatorComponent={Gap}
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
              <Button label="Try again" onPress={() => load(failed.current.page, failed.current.mode)} variant="secondary" size="s" />
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
      />
      <PeriodSheet visible={sheetOpen} value={period} now={new Date()} onChange={setPeriod} onClose={() => setSheetOpen(false)} />
    </View>
  );
};

const Gap = () => <View style={styles.gap} />;

const HistoryRow = ({ order, onPress }: { order: Order; onPress: () => void }) => {
  const status = historyStatusInfo(order.state);
  const amount = money(order.amountExcludingDeliveryFee);
  const lost = order.state === 'REJECTED' || order.state === 'CANCELLED';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.orderId}, ${status.label}, ${amount}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.line}>
        <Txt variant="headline" numberOfLines={1} style={styles.grow}>
          #{order.orderId}
        </Txt>
        <Txt variant="headline" tabular numberOfLines={1} color={lost ? colors.ink3 : colors.ink} style={styles.fixed}>
          {amount}
        </Txt>
      </View>
      <View style={styles.line}>
        <Txt variant="footnote" color={colors.ink2} numberOfLines={1} style={styles.grow}>
          {clockTime(order.creationTime)}
          {order.customerName ? ` · ${order.customerName}` : ''}
        </Txt>
        <View style={styles.fixed}>
          <StatusPill label={status.label} tone={status.tone} icon={status.icon} />
        </View>
      </View>
      <Txt variant="footnote" color={colors.ink2} numberOfLines={1}>
        {itemsSummary(order.orderItem)}
      </Txt>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  search: { paddingHorizontal: space.l, paddingBottom: space.s },
  // A sideways row inside a vertical screen grows to fill the free height unless told not to.
  chipRow: { flexGrow: 0 },
  chips: { gap: space.s, padding: space.l, alignItems: 'center' },
  periodChip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  list: { paddingHorizontal: space.l, paddingBottom: space.xl, flexGrow: 1 },
  gap: { height: space.s },
  spinner: { marginVertical: space.xxl },
  footer: { alignItems: 'center', gap: space.s, paddingVertical: space.l },
  skeletons: { gap: space.s },
  skeleton: { height: 96, borderRadius: radius.l, backgroundColor: colors.line },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
    paddingVertical: space.s,
    backgroundColor: colors.bg,
  },
  sectionTotal: { flexShrink: 1 },
  row: {
    gap: 4,
    padding: space.l,
    borderRadius: radius.l,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.75 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  grow: { flex: 1, minWidth: 0 },
  fixed: { flexShrink: 0 },
});
