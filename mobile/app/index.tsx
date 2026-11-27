import { useLocalSearchParams } from 'expo-router';
import { readMeetId } from '../../public/study-together';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Login, watchSession } from '../src/auth';
import { Library } from '../src/library';
import { ui } from '../src/ui';
import { LoadingScreen } from '../src/arrival';
import { usePreferences, words } from '../src/strings';

export default function Index() {
  const { meet } = useLocalSearchParams<{ meet?: string }>();
  const invitation = readMeetId(meet) ?? undefined;
  const t = words[usePreferences(s => s.locale)];
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
    {!ready || !preferencesReady ? <LoadingScreen label={t.loading} /> : session ? <Library key={session.user.id} id={session.user.id} invitation={invitation} /> : <Login invitation={invitation} />}
  </SafeAreaView>;
}
