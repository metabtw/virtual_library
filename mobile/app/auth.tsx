import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingScreen } from '../src/arrival';
import { completeAuthCode } from '../src/api';
import { usePreferences, words } from '../src/strings';
import { Button, ui } from '../src/ui';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const t = words[usePreferences(s => s.locale)];
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof code !== 'string' || !code) {
      setFailed(true);
      return;
    }
    let mounted = true;
    setFailed(false);
    void completeAuthCode(code).then(
      () => { if (mounted) router.replace('/'); },
      () => { if (mounted) setFailed(true); },
    );
    return () => { mounted = false; };
  }, [code, router]);

  return <SafeAreaView style={ui.screen}>
    {failed ? <View style={ui.content}>
      <Text style={ui.title}>{t.app}</Text>
      <View style={ui.card}>
        <Text accessibilityLiveRegion="polite" style={ui.warning}>{t.authLinkError}</Text>
        <Button onPress={() => router.replace('/')}>{t.signIn}</Button>
      </View>
    </View> : <LoadingScreen label={t.loading} />}
  </SafeAreaView>;
}
