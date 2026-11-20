import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    <View style={ui.content}>
      <Text style={ui.title}>{t.app}</Text>
      {failed ? <View style={ui.card}>
        <Text accessibilityLiveRegion="polite" style={ui.warning}>{t.authLinkError}</Text>
        <Button onPress={() => router.replace('/')}>{t.signIn}</Button>
      </View> : <ActivityIndicator color="#ffb360" accessibilityLabel={t.loading} />}
    </View>
  </SafeAreaView>;
}
