import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { OrderCard } from '../components/OrderCard';
import { SetupChecklist } from '../components/SetupChecklist';
import { byPhase, type Board } from '../domain/board';
import type { OrderPhase } from '../domain/order';
import type { StoreStatusApi } from '../hooks/useStoreStatus';
import { logout, playTestSound, type Session, type SetupStatus } from '../native/vendor';
import { Button } from '../ui/Button';
import { colors, ui } from '../ui/theme';

const TABS: { phase: OrderPhase; label: string; empty: string }[] = [
  { phase: 'PENDING', label: 'New', empty: 'No new orders. The phone will ring when one arrives.' },
  { phase: 'ACCEPTED', label: 'Preparing', empty: 'Nothing being prepared.' },
  { phase: 'READY_FOR_PICKUP', label: 'Ready', empty: 'Nothing waiting for a rider.' },
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
}

// Board, setup status and the "new order brings New to the front" rule live in MainShell; this screen shows them.
export const OrdersScreen = ({ session, board, setup, segment: tab, onSegment: setTab }: OrdersScreenProps) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const confirmLogout = () =>
    Alert.alert('Log out?', 'New orders will NOT ring on this phone until you log in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);

  const live = board.socket ? 'Live' : board.lastPollOk === false ? 'No connection' : 'Connecting';
  const liveColor = board.socket ? colors.success : board.lastPollOk === false ? colors.danger : colors.warning;
  const current = TABS.find(t => t.phase === tab) ?? TABS[0];
  const entries = byPhase(board, tab);

  return (
    <View style={ui.screen}>
      <View style={styles.header}>
        <View>
          <Text style={ui.title}>QuickVerse Vendor</Text>
          <View style={[ui.row, styles.status]}>
            <View style={[styles.dot, { backgroundColor: liveColor }]} />
            <Text style={ui.muted}>
              {live} · Shop #{session.shopId}
            </Text>
          </View>
        </View>
        <View style={[ui.row, styles.actions]}>
          <Button label="Test sound" onPress={playTestSound} outline compact />
          <Button label="Log out" onPress={confirmLogout} outline compact color={colors.danger} />
        </View>
      </View>

      <View style={[ui.row, styles.tabs]}>
        {TABS.map(t => {
          const count = byPhase(board, t.phase).length;
          const on = t.phase === tab;
          return (
            <Text
              key={t.phase}
              onPress={() => setTab(t.phase)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && styles.tabOn, t.phase === 'PENDING' && count > 0 && !on && styles.tabAlert]}>
              {t.label} ({count})
            </Text>
          );
        })}
      </View>

      <FlatList
        data={entries}
        keyExtractor={e => e.order.orderId}
        renderItem={({ item }) => <OrderCard entry={item} now={now} />}
        ListHeaderComponent={<SetupChecklist status={setup} />}
        ListEmptyComponent={<Text style={[ui.muted, styles.empty]}>{current.empty}</Text>}
        contentContainerStyle={styles.list}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  status: { gap: 6, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  actions: { gap: 8 },
  tabs: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, textAlign: 'center', paddingVertical: 12, fontWeight: '700', color: colors.muted },
  tabOn: { color: colors.primary, borderBottomWidth: 3, borderBottomColor: colors.primary },
  tabAlert: { color: colors.danger },
  list: { paddingBottom: 24 },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
