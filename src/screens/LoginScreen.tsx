import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ApiError } from '../api/client';
import { login, requestOtp } from '../api/endpoints';
import { OTP_LENGTH, OTP_RESEND_SECONDS } from '../config';
import { isValidIndianMobile } from '../domain/orderRules';
import { startSession, type Session } from '../native/vendor';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { colors, fonts, radius, space } from '../ui/theme';
import { Txt } from '../ui/Txt';

const messageOf = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export const LoginScreen = ({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) => {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const otpInput = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendOtp = async () => {
    if (!isValidIndianMobile(phone)) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setVerificationId(await requestOtp(phone));
      setOtp('');
      setResendIn(OTP_RESEND_SECONDS);
    } catch (e) {
      setError(messageOf(e, 'Failed to send OTP. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!verificationId) return;
    if (otp.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit OTP`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const session = await login(phone, otp, verificationId);
      startSession(session);
      onLoggedIn(session);
    } catch (e) {
      setError(messageOf(e, 'Invalid OTP'));
      setBusy(false);
    }
  };

  const onOtpStep = verificationId !== null;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="height">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.mark}>
          <Icon name="store" size={30} color={colors.onColor} />
        </View>
        <Txt variant="largeTitle" accessibilityRole="header">
          {onOtpStep ? 'Enter the code' : 'Log in to your store'}
        </Txt>
        <Txt variant="body" color={colors.ink2} style={styles.lead}>
          {onOtpStep
            ? `We sent a ${OTP_LENGTH}-digit code to +91 ${phone}.`
            : `We'll send a ${OTP_LENGTH}-digit code to your mobile.`}
        </Txt>

        {!onOtpStep ? (
          <>
            <Txt variant="callout" color={colors.ink2} style={styles.label}>
              Mobile number
            </Txt>
            <View style={[styles.field, !!error && styles.fieldError]}>
              <Txt variant="headline" color={colors.ink2}>
                +91
              </Txt>
              <View style={styles.divider} />
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={t => setPhone(t.replace(/\D/g, '').slice(0, 10))}
                keyboardType="number-pad"
                autoComplete="tel"
                placeholder="10-digit number"
                placeholderTextColor={colors.ink3}
                maxLength={10}
                editable={!busy}
                accessibilityLabel="Mobile number"
              />
            </View>
            <ErrorLine text={error} />
            <View style={styles.action}>
              <Button label="Send OTP" onPress={sendOtp} busy={busy} size="l" />
            </View>
          </>
        ) : (
          <>
            <Pressable style={styles.boxes} onPress={() => otpInput.current?.focus()} accessibilityLabel="One-time code">
              {Array.from({ length: OTP_LENGTH }, (_, i) => (
                <View key={i} style={[styles.box, i === Math.min(otp.length, OTP_LENGTH - 1) && styles.boxActive]}>
                  <Txt variant="largeTitle" tabular>
                    {otp[i] ?? ''}
                  </Txt>
                </View>
              ))}
              {/* One real input drives the four boxes; SMS autofill and paste land here. */}
              <TextInput
                ref={otpInput}
                style={styles.hiddenInput}
                value={otp}
                onChangeText={t => setOtp(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={OTP_LENGTH}
                autoFocus
                editable={!busy}
                caretHidden
              />
            </Pressable>
            <ErrorLine text={error} />
            <View style={styles.action}>
              <Button label="Verify & start" onPress={verify} busy={busy} size="l" />
            </View>
            <View style={styles.links}>
              <Button
                label={resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
                onPress={sendOtp}
                variant="ghost"
                size="s"
                disabled={resendIn > 0 || busy}
              />
              <Button
                label="Change number"
                onPress={() => {
                  setVerificationId(null);
                  setError('');
                }}
                variant="ghost"
                size="s"
                disabled={busy}
              />
            </View>
          </>
        )}

        <View style={styles.note}>
          <Icon name="bell-ring" size={18} color={colors.ink3} />
          <Txt variant="footnote" color={colors.ink2} style={styles.noteText}>
            Once you log in, new orders ring loudly on this phone, even on Silent.
          </Txt>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const ErrorLine = ({ text }: { text: string }) =>
  text ? (
    <View style={styles.error} accessibilityLiveRegion="polite">
      <Icon name="triangle-alert" size={16} color={colors.red} />
      <Txt variant="footnote" color={colors.red} style={styles.noteText}>
        {text}
      </Txt>
    </View>
  ) : null;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: space.xl, paddingTop: 56 },
  mark: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
  },
  lead: { marginTop: space.s, marginBottom: space.xl },
  label: { marginBottom: space.s },
  field: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.m,
    paddingHorizontal: space.l,
    backgroundColor: colors.surface,
  },
  fieldError: { borderColor: colors.red },
  divider: { width: 1, height: 24, backgroundColor: colors.line, marginHorizontal: space.m },
  phoneInput: { flex: 1, fontFamily: fonts.semibold, fontSize: 18, color: colors.ink, letterSpacing: 1, padding: 0 },
  boxes: { flexDirection: 'row', gap: space.m },
  box: {
    flex: 1,
    maxWidth: 72,
    height: 64,
    borderRadius: radius.m,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  hiddenInput: { position: 'absolute', width: '100%', height: '100%', opacity: 0 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.s },
  action: { marginTop: space.xl },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.m },
  note: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: 'auto', paddingTop: space.xxl },
  noteText: { flex: 1 },
});
