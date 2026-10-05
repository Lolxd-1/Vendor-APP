import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MIN_REJECT_REASON } from '../config';
import { isValidRejectReason } from '../domain/orderRules';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { colors, fonts, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

const PRESETS = ['Item out of stock', 'Kitchen is closing', 'Too many orders right now'];
const OTHER = 'Other reason';

// One tap for the common reasons, so nobody has to type during a rush.
export const RejectSheet = ({
  visible,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) => {
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [invalid, setInvalid] = useState('');

  useEffect(() => {
    if (!visible) {
      setChoice(null);
      setOther('');
      setInvalid('');
    }
  }, [visible]);

  const confirm = () => {
    const reason = choice === OTHER ? other : choice ?? '';
    if (!isValidRejectReason(reason, MIN_REJECT_REASON)) {
      setInvalid(`Reason must be at least ${MIN_REJECT_REASON} characters.`);
      return;
    }
    setInvalid('');
    onConfirm(reason.trim());
  };

  const message = invalid || error;

  return (
    <Sheet visible={visible} onClose={() => !busy && onCancel()} title="Reject order?">
      <Txt variant="body" color={colors.ink2} style={styles.lead}>
        Pick a reason. The customer will see it.
      </Txt>
      <View style={styles.options} accessibilityRole="radiogroup">
        {[...PRESETS, OTHER].map(label => {
          const on = choice === label;
          return (
            <Pressable
              key={label}
              onPress={() => setChoice(label)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={label}
              style={[styles.option, on && styles.optionOn]}>
              <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
              <Txt variant="body">{label}</Txt>
            </Pressable>
          );
        })}
      </View>
      {choice === OTHER && (
        <TextInput
          style={styles.input}
          value={other}
          onChangeText={setOther}
          placeholder="Type the reason"
          placeholderTextColor={colors.ink3}
          editable={!busy}
          autoFocus
          accessibilityLabel="Reason for rejecting"
        />
      )}
      {!!message && (
        <View style={styles.error} accessibilityLiveRegion="polite">
          <Icon name="triangle-alert" size={16} color={colors.red} />
          <Txt variant="footnote" color={colors.red} style={styles.flex}>
            {message}
          </Txt>
        </View>
      )}
      <View style={styles.actions}>
        <Button label="Reject order" onPress={confirm} variant="danger" size="l" busy={busy} disabled={!choice} />
        <Button label="Keep order" onPress={onCancel} variant="ghost" size="m" disabled={busy} />
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  lead: { marginBottom: space.m },
  options: { gap: space.s },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
  },
  optionOn: { borderColor: colors.red, backgroundColor: colors.redSoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.ink3, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.red },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red },
  input: {
    marginTop: space.m,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.m,
    paddingHorizontal: space.l,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  error: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.m },
  flex: { flex: 1 },
  actions: { marginTop: space.l, gap: space.s },
});
