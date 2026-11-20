import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Login, watchSession } from '../src/auth';
import { Library } from '../src/library';
import { ui } from '../src/ui';

export default function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => watchSession(setSession, () => setReady(true)), []);
  return <SafeAreaView style={ui.screen}>
    {!ready ? <ActivityIndicator color="#ffb360" /> : session ? <Library key={session.user.id} id={session.user.id} /> : <Login />}
  </SafeAreaView>;
}
