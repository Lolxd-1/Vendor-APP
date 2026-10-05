import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, PermissionsAndroid, Platform, StyleSheet, View } from 'react-native';
import { byPhase, type Board } from '../domain/board';
import type { OrderPhase } from '../domain/order';
import { useShopProfile } from '../hooks/useShopProfile';
import { useStoreStatus } from '../hooks/useStoreStatus';
import { getBoard, getSetupStatus, onBoardChanged, pollNow, type Session } from '../native/vendor';
import { HistoryScreen } from '../screens/HistoryScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { EmptyState } from '../ui/EmptyState';
import { LargeHeader } from '../ui/LargeHeader';
import { colors } from '../ui/theme';
import { TabBar } from './TabBar';

export type TabKey = 'orders' | 'history' | 'insights' | 'account';
export type PageKey = 'timings' | 'alerts';
interface Nav {
  tab: TabKey;
  stack: PageKey[];
}

/** Android back: close the open page, else go back to Orders, else let Android leave the app (null). */
export const backAction = ({ tab, stack }: Nav): Nav | null => {
  if (stack.length > 0) return { tab, stack: stack.slice(0, -1) };
  if (tab !== 'orders') return { tab: 'orders', stack: [] };
  return null;
};

const requestNotificationPermission = async () => {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
};

const PAGE_TITLES: Record<PageKey, string> = { timings: 'Store timings', alerts: 'Order alerts' };

// The logged-in app: four tabs over the native order board, plus pages pushed on top (store timings, alerts).
export const MainShell = ({ session }: { session: Session }) => {
  const [board, setBoard] = useState<Board>(getBoard);
  const [setup, setSetup] = useState(getSetupStatus);
  const [nav, setNav] = useState<Nav>({ tab: 'orders', stack: [] });
  const [segment, setSegment] = useState<OrderPhase>('PENDING');
  const [visited, setVisited] = useState<TabKey[]>(['orders']);
  const store = useStoreStatus(session.shopId);
  const profile = useShopProfile(session.shopId, board);

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
    return () => {
      boardSub.remove();
      appSub.remove();
    };
  }, [refresh]);

  // A new order always brings Orders > New to the front, from any tab or page.
  const pendingCount = byPhase(board, 'PENDING').length;
  const lastPending = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount > lastPending.current) {
      setNav({ tab: 'orders', stack: [] });
      setSegment('PENDING');
    }
    lastPending.current = pendingCount;
  }, [pendingCount]);

  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const next = backAction(navRef.current);
      if (!next) return false;
      setNav(next);
      return true;
    });
    return () => sub.remove();
  }, []);

  const selectTab = (tab: TabKey) => {
    setVisited(v => (v.includes(tab) ? v : [...v, tab]));
    setNav({ tab, stack: [] });
  };
  const openPage = useCallback((page: PageKey) => setNav(n => ({ ...n, stack: [...n.stack, page] })), []);
  const closePage = useCallback(() => setNav(n => ({ ...n, stack: n.stack.slice(0, -1) })), []);

  const page = nav.stack[nav.stack.length - 1];
  const tabs: Record<TabKey, React.ReactNode> = {
    orders: (
      <OrdersScreen
        session={session}
        board={board}
        setup={setup}
        store={store}
        shopName={profile?.name ?? null}
        segment={segment}
        onSegment={setSegment}
        onOpenAlerts={() => openPage('alerts')}
        onOpenTimings={() => openPage('timings')}
      />
    ),
    history: <HistoryScreen shopId={session.shopId} />,
    insights: <InsightsScreen shopId={session.shopId} board={board} active={nav.tab === 'insights' && !page} />,
    account: <EmptyState icon="store" title="Account" />,
  };

  return (
    <View style={styles.root}>
      {/* Visited tabs stay mounted (hidden) so they keep their scroll position and filters. */}
      {visited.map(key => (
        <View key={key} style={[styles.fill, (key !== nav.tab || !!page) && styles.hidden]}>
          {tabs[key]}
        </View>
      ))}
      {page && (
        <View style={styles.fill}>
          <LargeHeader title={PAGE_TITLES[page]} onBack={closePage} />
        </View>
      )}
      {!page && <TabBar tab={nav.tab} pending={pendingCount} onChange={selectTab} />}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  hidden: { display: 'none' },
});
