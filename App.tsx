import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { MainShell } from './src/app/MainShell';
import { getSession, onSessionEnded, type Session } from './src/native/vendor';
import { LoginScreen } from './src/screens/LoginScreen';
import { colors, ui } from './src/ui/theme';

// The native watcher owns the session and the ringing; this is only the window onto it.
const App = () => {
  const [session, setSession] = useState<Session | null>(getSession);

  // Logout (manual, or the watcher seeing an expired token) returns to the login screen.
  useEffect(() => {
    const sub = onSessionEnded(() => setSession(null));
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={session ? colors.bg : colors.surface} />
      {/* The tab bar pads itself for the gesture bar, so only the top and sides are inset here. */}
      <SafeAreaView style={[ui.screen, !session && styles.login]} edges={['top', 'left', 'right']}>
        {session ? <MainShell session={session} /> : <LoginScreen onLoggedIn={setSession} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({ login: { backgroundColor: colors.surface } });

export default App;
