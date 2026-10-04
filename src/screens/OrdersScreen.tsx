import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import { OrderCard } from '../components/OrderCard';
import { SetupChecklist } from '../components/SetupChecklist';
import { byPhase, type Board } from '../domain/board';
import type { OrderPhase } from '../domain/order';
import { getBoard, getSetupStatus, logout, onBoardChanged, playTestSound, pollNow, type Session } from '../native/vendor';
import { Button } from '../ui/Button';
import { colors, ui } from '../ui/theme';

const TABS: { phase: OrderPhase; label: string; empty: string }[] = [
  { phase: 'PENDING', label: 'New', empty: 'No new orders. The phone will ring when one arrives.' },
  { phase: 'ACCEPTED', label: 'Preparing', empty: 'Nothing being prepared.' },
  { phase: 'READY_FOR_PICKUP', label: 'Ready', empty: 'Nothing waiting for a rider.' },
];

const requestNotificationPermission = async () => {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
};

export const OrdersScreen = ({ session }: { session: Session }) => {
  const [board, setBoard] = useState<Board>(getBoard);
  const [setup, setSetup] = useState(getSetupStatus);
  const [tab, setTab] = useState<OrderPhase>('PENDING');
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(() => {
    setBoard(getBoard());
    setSetup(getSetupStatus());
  }, []);

  useEffect(() => {
    requestNotificationPermission().finally(refresh);
    const boardSub = onBoardChanged(() => setBoard(getBoard()));
    const appSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh();
        pollNow();
      }
    });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      boardSub.remove();
      appSub.remove();
      clearInterval(tick);
    };
  }, [refresh]);

  // A new order always brings the New tab to the front.
  const pendingCount = byPhase(board, 'PENDING').length;
  const lastPending = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount > lastPending.current) setTab('PENDING');
    lastPending.current = pendingCount;
  }, [pendingCount]);

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
