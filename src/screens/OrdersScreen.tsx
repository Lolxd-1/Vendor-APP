import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { OrderCard } from '../components/OrderCard';
import { SetupChecklist } from '../components/SetupChecklist';
import { StoreSwitch } from '../components/StoreSwitch';
import { byPhase, type Board } from '../domain/board';
import type { OrderPhase } from '../domain/order';
import type { StoreStatusApi } from '../hooks/useStoreStatus';
import type { Session, SetupStatus } from '../native/vendor';
import { StatusPill } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import type { IconName } from '../ui/Icon';
import { Icon } from '../ui/Icon';
import { LargeHeader } from '../ui/LargeHeader';
import { Segmented } from '../ui/Segmented';
import { colors, radius, space, type Tone } from '../ui/theme';
import { Txt } from '../ui/Txt';

const TABS: { phase: OrderPhase; label: string; icon: IconName; empty: string; hint?: string }[] = [
  { phase: 'PENDING', label: 'New', icon: 'bell', empty: 'No new orders', hint: 'The phone will ring when one arrives.' },
  { phase: 'ACCEPTED', label: 'Preparing', icon: 'chef-hat', empty: 'Nothing being prepared' },
  { phase: 'READY_FOR_PICKUP', label: 'Ready', icon: 'package-check', empty: 'No orders waiting for a rider' },
];

export interface OrdersScreenProps {
  session: Session;
  board: Board;
  setup: SetupStatus;
  store: StoreStatusApi;
  shopName: string | null;
  segment: OrderPhase;
  onSegment: (phase: OrderPhase) => void;
  onOpenAlerts: () => void;
  onOpenTimings: () => void;
}

const connection = (board: Board): { label: string; tone: Tone; icon: IconName } =>
  board.socket
    ? { label: 'Live', tone: 'green', icon: 'wifi' }
    : board.lastPollOk === false
    ? { label: 'No connection', tone: 'red', icon: 'wifi-off' }
    : { label: 'Connecting', tone: 'amber', icon: 'refresh-cw' };

// Board, setup status and the "new order brings New to the front" rule live in MainShell; this screen shows them.
export const OrdersScreen = ({
  session,
  board,
  setup,
  store,
  shopName,
  segment,
  onSegment,
  onOpenAlerts,
  onOpenTimings,
}: OrdersScreenProps) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const current = TABS.find(t => t.phase === segment) ?? TABS[0];
  const entries = byPhase(board, segment);
  const conn = connection(board);
  const { status } = store;

  return (
    <View style={styles.screen}>
      <LargeHeader
        title="Orders"
        subtitle={
          <View style={styles.subtitle}>
            {!!shopName && (
              <Txt variant="headline" numberOfLines={1}>
                {shopName}
              </Txt>
            )}
            <View style={styles.meta}>
              <Txt variant="footnote" color={colors.ink2}>
                Shop #{session.shopId}
              </Txt>
              <StatusPill label={conn.label} tone={conn.tone} icon={conn.icon} />
            </View>
          </View>
        }
        right={<StoreSwitch store={store} onOpenTimings={onOpenTimings} />}
      />

      {!status.online && (
        <View style={styles.offline}>
          <Icon name="power" size={20} color={colors.red} />
          <Txt variant="callout" color={colors.red} style={styles.flex}>
            {status.reason === 'schedule'
              ? "Closed by store timings. Customers can't order right now."
              : "You're offline. Customers can't order right now."}
          </Txt>
          {status.reason === 'schedule' ? (
            <Button label="Timings" onPress={onOpenTimings} size="s" variant="secondary" />
          ) : (
            <Button label="Go online" onPress={() => store.setOnline(true)} size="s" busy={store.busy} />
          )}
        </View>
      )}

      <SetupChecklist status={setup} onFix={onOpenAlerts} />

      <View style={styles.segments}>
        <Segmented
          items={TABS.map(t => ({
            key: t.phase,
            label: t.label,
            count: byPhase(board, t.phase).length,
            alert: t.phase === 'PENDING',
          }))}
          value={segment}
          onChange={onSegment}
        />
      </View>

      {segment === 'PENDING' && entries.length > 0 && (
        <View style={styles.ringing} accessibilityLiveRegion="polite">
          <Icon name="bell-ring" size={18} color={colors.blue} />
          <Txt variant="callout" color={colors.blue} style={styles.flex}>
            Phone keeps ringing until you accept or reject
          </Txt>
        </View>
      )}

      <FlatList
        data={entries}
        keyExtractor={e => e.order.orderId}
        renderItem={({ item }) => <OrderCard entry={item} now={now} />}
        ListEmptyComponent={<EmptyState icon={current.icon} title={current.empty} body={current.hint} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  subtitle: { gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  flex: { flex: 1 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    marginHorizontal: space.l,
    marginBottom: space.m,
    padding: space.m,
    borderRadius: radius.l,
    backgroundColor: colors.redSoft,
  },
  segments: { paddingHorizontal: space.l, paddingBottom: space.m },
  ringing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    marginHorizontal: space.l,
    marginBottom: space.m,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.m,
    backgroundColor: colors.blueSoft,
  },
  list: { paddingBottom: space.xl, flexGrow: 1 },
});
