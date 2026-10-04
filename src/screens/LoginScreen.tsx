import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../api/client';
import { login, requestOtp } from '../api/endpoints';
import { OTP_LENGTH, OTP_RESEND_SECONDS } from '../config';
import { isValidIndianMobile } from '../domain/orderRules';
import { startSession, type Session } from '../native/vendor';
import { Button } from '../ui/Button';
import { colors, ui } from '../ui/theme';

const messageOf = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export const LoginScreen = ({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) => {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);

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
    <KeyboardAvoidingView style={[ui.screen, styles.center]} behavior="height">
      <View style={[ui.card, styles.box]}>
        <Text style={styles.brand}>QuickVerse Vendor</Text>
        {!onOtpStep ? (
          <>
            <Text style={ui.muted}>Mobile number</Text>
            <TextInput
              style={[ui.input, styles.gap]}
              value={phone}
              onChangeText={t => setPhone(t.replace(/\D/g, '').slice(0, 10))}
              keyboardType="number-pad"
              autoComplete="tel"
              placeholder="10-digit mobile number"
              placeholderTextColor={colors.muted}
              maxLength={10}
              editable={!busy}
            />
            {!!error && <Text style={ui.error}>{error}</Text>}
            <View style={styles.gap}>
              <Button label="Send OTP" onPress={sendOtp} busy={busy} />
            </View>
          </>
        ) : (
          <>
            <Text style={ui.muted}>Enter the {OTP_LENGTH}-digit code sent to +91 {phone}</Text>
            <TextInput
              style={[ui.input, styles.gap, styles.otp]}
              value={otp}
              onChangeText={t => setOtp(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={OTP_LENGTH}
              autoFocus
              editable={!busy}
            />
            {!!error && <Text style={ui.error}>{error}</Text>}
            <View style={styles.gap}>
              <Button label="Verify & start" onPress={verify} busy={busy} />
            </View>
            <View style={[ui.row, styles.links]}>
              <Button
                label={resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
                onPress={sendOtp}
                outline
                compact
                disabled={resendIn > 0 || busy}
              />
              <Button
                label="Change number"
                onPress={() => {
                  setVerificationId(null);
                  setError('');
                }}
                outline
                compact
                color={colors.muted}
                disabled={busy}
              />
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  center: { justifyContent: 'center' },
  box: { padding: 20 },
  brand: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 20 },
  gap: { marginTop: 12 },
  otp: { fontSize: 24, letterSpacing: 12, textAlign: 'center' },
  links: { justifyContent: 'space-between', marginTop: 16 },
});
