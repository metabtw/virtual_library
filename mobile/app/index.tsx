import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Login, watchSession } from '../src/auth';
import { Library } from '../src/library';
import { ui } from '../src/ui';
import { usePreferences } from '../src/strings';

export default function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(usePreferences.persist.hasHydrated);
  useEffect(() => {
    let mounted = true;
    const finish = () => {
      if (mounted) setPreferencesReady(true);
    };
    void Promise.resolve(usePreferences.persist.rehydrate()).then(finish, finish);
    return () => { mounted = false; };
  }, []);
  useEffect(() => watchSession(setSession, () => setReady(true)), []);
  return <SafeAreaView style={ui.screen}>
    {!ready || !preferencesReady ? <ActivityIndicator color="#ffb360" /> : session ? <Library key={session.user.id} id={session.user.id} /> : <Login />}
  </SafeAreaView>;
}
