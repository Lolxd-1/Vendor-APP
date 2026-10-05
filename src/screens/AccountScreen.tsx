import React, { useState } from 'react';
import { Alert, Image, Linking, ScrollView, StyleSheet, ToastAndroid, View } from 'react-native';
import { version } from '../../package.json';
import { missingSetup } from '../components/SetupChecklist';
import { initials } from '../domain/format';
import type { ShopDetails } from '../domain/order';
import { logout, playTestSound, type Session, type SetupStatus } from '../native/vendor';
import { Group, Row } from '../ui/List';
import { LargeHeader } from '../ui/LargeHeader';
import { colors, space } from '../ui/theme';
import { Txt } from '../ui/Txt';
import type { PageKey } from '../app/MainShell';

const addressOf = (d: ShopDetails | null): string =>
  [d?.address?.address, d?.address?.city, d?.address?.state, d?.address?.postalCode]
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .join(', ');

const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

export const AccountScreen = ({
  session,
  profile,
  setup,
  onOpen,
}: {
  session: Session;
  profile: ShopDetails | null;
  setup: SetupStatus;
  onOpen: (page: PageKey) => void;
}) => {
  const [logoFailed, setLogoFailed] = useState(false);
  const name = text(profile?.name);
  const logo = text(profile?.logo);
  const owner = text(profile?.owner);
  const phone = text(profile?.phone);
  const address = addressOf(profile);
  const hours = text(profile?.openingTime) && text(profile?.closingTime) ? `${text(profile?.openingTime)} – ${text(profile?.closingTime)}` : '';
  const needsFix = missingSetup(setup) > 0;

  const confirmLogout = () =>
    Alert.alert('Log out?', 'New orders will NOT ring on this phone until you log in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <LargeHeader title="Account" />

      <View style={styles.profile}>
        {/^https?:\/\//.test(logo) && !logoFailed ? (
          <Image source={{ uri: logo }} style={styles.logo} onError={() => setLogoFailed(true)} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.logo, styles.initials]}>
            <Txt variant="title" color={colors.onColor}>
              {initials(name)}
            </Txt>
          </View>
        )}
        <View style={styles.profileText}>
          <Txt variant="title" numberOfLines={2}>
            {name || `Shop #${session.shopId}`}
          </Txt>
          {!!text(profile?.category) && (
            <Txt variant="footnote" color={colors.ink2}>
              {text(profile?.category)}
            </Txt>
          )}
          {!!name && (
            <Txt variant="footnote" color={colors.ink2}>
              Shop #{session.shopId}
            </Txt>
          )}
        </View>
      </View>

      <Group title="Store">
        <Row icon="calendar-clock" title="Store timings" subtitle="When your store is closed" onPress={() => onOpen('timings')} />
        <Row
          icon="bell-ring"
          iconTone={needsFix ? 'red' : 'blue'}
          title="Order alerts & phone setup"
          value={needsFix ? 'Fix needed' : undefined}
          onPress={() => onOpen('alerts')}
        />
        <Row
          icon="volume-2"
          title="Test order sound"
          onPress={() => {
            playTestSound();
            ToastAndroid.show('Playing test sound', ToastAndroid.SHORT);
          }}
          chevron={false}
        />
      </Group>

      {(!!owner || !!phone || !!address || !!hours) && (
        <Group title="Shop details">
          {!!owner && <Row icon="user-round" title="Owner" value={owner} />}
          {!!phone && <Row icon="phone" title="Phone" value={phone} onPress={() => Linking.openURL(`tel:${phone}`)} chevron={false} />}
          {!!address && <Row icon="map-pin" title="Address" subtitle={address} />}
          {!!hours && <Row icon="clock" title="Usual hours" value={hours} />}
        </Group>
      )}

      <Group title="App">
        <Row icon="smartphone" title={`Signed in as +91 ${session.phone}`} />
        <Row icon="info" title="Version" value={version} />
      </Group>

      <Group footer="After you log out, this phone stops ringing for new orders.">
        <Row icon="log-out" title="Log out" danger onPress={confirmLogout} />
      </Group>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxl },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.l, paddingHorizontal: space.l, paddingTop: space.s },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.blueSoft },
  initials: { backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  profileText: { flex: 1, gap: 2 },
});
