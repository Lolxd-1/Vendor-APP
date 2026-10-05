import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { getDashboardStats } from '../api/endpoints';
import { byPhase, type Board } from '../domain/board';
import { minutesLabel, money } from '../domain/format';
import { useRemote } from '../hooks/useRemote';
import { EmptyState } from '../ui/EmptyState';
import { Group, Row } from '../ui/List';
import { LargeHeader } from '../ui/LargeHeader';
import { colors, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const todayLabel = (d: Date) => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;

// Today's business at a glance. Numbers come from the backend's dashboard-stats; "Right now" is the live board.
export const InsightsScreen = ({ shopId, board, active }: { shopId: string; board: Board; active: boolean }) => {
  const stats = useRemote(() => getDashboardStats(shopId), [shopId]);
  const { reload } = stats;

  // Fresh numbers every time the tab is opened (the first open is already loading).
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) reload();
    wasActive.current = active;
  }, [active, reload]);

  const s = stats.data;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={stats.loading && !!s} onRefresh={reload} colors={[colors.blue]} />}>
      <LargeHeader title="Today" subtitle={todayLabel(new Date())} />

      {!s && stats.loading && <ActivityIndicator color={colors.blue} style={styles.spinner} />}
      {!s && !stats.loading && stats.error && (
        <EmptyState
          icon="wifi-off"
          title="Couldn't load today's numbers"
          body={stats.error}
          action={{ label: 'Try again', onPress: reload }}
        />
      )}

      {s && (
        <>
          <View style={styles.hero} accessible accessibilityLabel={`Earnings today ${money(s.revenue)}, from ${s.orders} orders`}>
            <Txt variant="callout" color={colors.ink2}>
              Earnings today
            </Txt>
            <Txt variant="display" tabular>
              {money(s.revenue)}
            </Txt>
            <Txt variant="footnote" color={colors.ink2}>
              {s.orders === 1 ? 'From 1 order' : `From ${s.orders} orders`}
            </Txt>
          </View>

          <Group title="Orders today">
            <Row icon="receipt-text" title="Orders" value={String(s.orders)} />
            <Row icon="circle-check" iconTone="green" title="Completed" value={`${s.completionRate}%`} />
            <Row icon="timer" title="Avg time to accept" value={minutesLabel(s.avgAcceptSec)} />
            <Row icon="chef-hat" iconTone="amber" title="Avg cooking time" value={minutesLabel(s.avgPrepSec)} />
          </Group>
          {!!stats.error && (
            <Txt variant="footnote" color={colors.red} style={styles.stale}>
              {stats.error}. Showing the last numbers.
            </Txt>
          )}
        </>
      )}

      <Group title="Right now" footer="Updates when you open this tab or pull down.">
        <Row icon="bell" title="New" value={String(byPhase(board, 'PENDING').length)} />
        <Row icon="chef-hat" iconTone="amber" title="Preparing" value={String(byPhase(board, 'ACCEPTED').length)} />
        <Row
          icon="package-check"
          iconTone="green"
          title="Ready for pickup"
          value={String(byPhase(board, 'READY_FOR_PICKUP').length)}
        />
      </Group>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxl },
  spinner: { marginVertical: space.xxl },
  hero: { paddingHorizontal: space.l, paddingTop: space.s, gap: 2 },
  stale: { marginHorizontal: space.l, marginTop: space.s },
});
