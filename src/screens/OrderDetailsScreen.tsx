import React, { type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { clockTime, dayTime, historyStatusInfo, money, paymentLabel } from '../domain/format';
import type { Order } from '../domain/order';
import { payoutOf } from '../domain/payout';
import { timelineOf, type Step } from '../domain/timeline';
import { StatusPill } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { LargeHeader } from '../ui/LargeHeader';
import { colors, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.section}>
    <Txt variant="callout" color={colors.ink2} style={styles.sectionTitle} accessibilityRole="header">
      {title}
    </Txt>
    <View style={styles.card}>{children}</View>
  </View>
);

const Line = ({
  label,
  value,
  strong,
  color,
  labelLines = 1,
}: {
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
  labelLines?: number;
}) => (
  <View style={styles.line}>
    <Txt
      variant={strong ? 'headline' : 'body'}
      color={strong ? colors.ink : colors.ink2}
      numberOfLines={labelLines}
      style={styles.label}>
      {label}
    </Txt>
    <Txt variant={strong ? 'headline' : 'body'} color={color} tabular style={styles.value}>
      {value}
    </Txt>
  </View>
);

const TONE_COLOR = { neutral: colors.blue, green: colors.green, red: colors.red };
const DETAIL_COLOR = { neutral: colors.ink2, green: colors.green, red: colors.red };

const StepRow = ({ step, last }: { step: Step; last: boolean }) => {
  const tone = TONE_COLOR[step.tone];
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={[styles.dot, step.done ? { backgroundColor: tone, borderColor: tone } : { borderColor: colors.line }]} />
        {!last && <View style={styles.connector} />}
      </View>
      <View style={styles.stepBody}>
        <Txt variant="headline" color={step.done ? colors.ink : colors.ink3}>
          {step.title}
        </Txt>
        {!!step.detail && (
          <Txt variant="footnote" color={DETAIL_COLOR[step.tone]}>
            {step.detail}
          </Txt>
        )}
      </View>
      {step.at !== null && (
        <Txt variant="callout" tabular style={styles.stepTime}>
          {clockTime(step.at)}
        </Txt>
      )}
    </View>
  );
};

export const OrderDetailsScreen = ({ order, onBack }: { order: Order; onBack: () => void }) => {
  const status = historyStatusInfo(order.state);
  const payout = payoutOf(order);
  const steps = timelineOf(order);
  const items = Array.isArray(order.orderItem) ? order.orderItem : [];
  const rider = order.deliveryPartnerDetails;
  const note = typeof order.orderDescription === 'string' ? order.orderDescription.trim() : '';
  const state = String(order.state).trim().toUpperCase();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <LargeHeader title={`Order #${order.orderId}`} onBack={onBack} />

      <View style={styles.status}>
        <View style={styles.pills}>
          <StatusPill label={status.label} tone={status.tone} icon={status.icon} />
          {payout && (
            <StatusPill
              label={payout.settled ? 'Settled' : 'To be paid'}
              tone={payout.settled ? 'green' : 'amber'}
              icon={payout.settled ? 'badge-check' : 'hourglass'}
            />
          )}
        </View>
        <Txt variant="footnote" color={colors.ink2} numberOfLines={1}>
          {`${dayTime(order.creationTime, Date.now())} · ${paymentLabel(order.paymentMethod)}`}
        </Txt>
        {!!order.customerName && (
          <Txt variant="footnote" color={colors.ink2} numberOfLines={1}>
            {order.customerName}
          </Txt>
        )}
      </View>

      <Section title="Timeline">
        {steps.map((s, i) => (
          <StepRow key={s.key} step={s} last={i === steps.length - 1} />
        ))}
      </Section>

      <Section title="Bill">
        {items.length === 0 && (
          <Txt variant="body" color={colors.ink2}>
            No items listed
          </Txt>
        )}
        {items.map((it, i) => (
          <Line
            key={`${it.id}-${i}`}
            label={`${it.itemCount ?? 1} × ${it.name || 'Item'}`}
            labelLines={2}
            value={typeof it.itemPrice === 'number' && typeof it.itemCount === 'number' ? money(it.itemPrice * it.itemCount) : ''}
          />
        ))}
        <Line label="Items total" value={money(order.amountExcludingDeliveryFee)} strong />
        {typeof order.deliveryFee === 'number' && (
          <Line label="Delivery fee (paid by customer)" value={money(order.deliveryFee)} />
        )}
        {typeof order.totalAmount === 'number' && <Line label="Customer paid" value={money(order.totalAmount)} />}
      </Section>

      <Section title="Your earnings">
        {payout ? (
          <>
            <Line label="Gross revenue" value={money(payout.gross)} />
            <Line
              label={`Commission (${payout.pct}%${payout.estimated ? ', estimated' : ''})`}
              value={money(-payout.commission)}
            />
            <Line label="Net receivable" value={money(payout.net)} strong color={colors.green} />
            <Txt variant="footnote" color={colors.ink2}>
              Commission is the only deduction.
            </Txt>
            {payout.estimated && (
              <Txt variant="footnote" color={colors.ink2}>
                Estimated at 10% because QuickVerse did not send the commission for this order.
              </Txt>
            )}
          </>
        ) : (
          <Txt variant="body" color={colors.ink2}>
            {state === 'REJECTED' || state === 'CANCELLED' ? 'No payout for this order' : 'Payout after delivery'}
          </Txt>
        )}
      </Section>

      {note !== '' && (
        <View style={[styles.section, styles.card, styles.noteCard]}>
          <Icon name="message-square-text" size={18} color={colors.ink2} />
          <View style={styles.stepBody}>
            <Txt variant="caption" color={colors.ink2}>
              Note from customer
            </Txt>
            <Txt variant="body">{note}</Txt>
          </View>
        </View>
      )}

      {!!rider?.name && (
        <View style={[styles.section, styles.card, styles.noteCard]}>
          <Icon name="bike" size={20} color={colors.blue} />
          <Txt variant="body" numberOfLines={1} style={styles.label}>
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
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxl },
  status: { paddingHorizontal: space.l, gap: space.xs },
  pills: { flexDirection: 'row', gap: space.s, marginBottom: space.xs },
  section: { marginTop: space.xl, marginHorizontal: space.l },
  sectionTitle: { marginBottom: space.s, marginLeft: space.xs },
  card: {
    gap: space.s,
    padding: space.l,
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  noteCard: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  label: { flex: 1, minWidth: 0 },
  value: { flexShrink: 0 },
  step: { flexDirection: 'row', gap: space.m },
  rail: { alignItems: 'center', width: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 5 },
  connector: { flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 2 },
  stepBody: { flex: 1, minWidth: 0, paddingBottom: space.m },
  stepTime: { flexShrink: 0 },
});
