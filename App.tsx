import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getSession, onSessionEnded, type Session } from './src/native/vendor';
import { LoginScreen } from './src/screens/LoginScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
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
      <StatusBar barStyle="dark-content" backgroundColor={colors.card} />
      <SafeAreaView style={ui.screen}>
        {session ? <OrdersScreen session={session} /> : <LoginScreen onLoggedIn={setSession} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

export default App;
