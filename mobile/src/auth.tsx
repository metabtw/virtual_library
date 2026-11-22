import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { emailAuthMessage } from '../../public/library-client';
import { authCallbackUrl, completeAuthCode, supabase } from './api';
import { Button, Field, ui } from './ui';
import { usePreferences, words, type Locale, type Translation } from './strings';

const appleEnabled = process.env.EXPO_PUBLIC_AUTH_APPLE === 'true';
const googleEnabled = process.env.EXPO_PUBLIC_AUTH_GOOGLE === 'true';
const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_URL;
WebBrowser.maybeCompleteAuthSession();

export function PrivacyLink({ locale, t }: { locale: Locale; t: Translation }) {
  let url: URL;
  try { url = new URL(privacyUrl ?? ''); }
  catch { return null; }
  if (url.protocol !== 'https:') return null;
  url.searchParams.set('lang', locale);
  return <Button muted onPress={() => void Linking.openURL(url.toString()).catch(() => {})}>{t.readPrivacy}</Button>;
}

export function Login() {
  const locale = usePreferences(s => s.locale);
  const setLocale = usePreferences(s => s.setLocale);
  const t = words[locale];
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ReturnType<typeof emailAuthMessage>>();
  const resendSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));

  useEffect(() => {
    if (!sentTo || retryAt <= Date.now()) return;
    const timer = setInterval(() => {
      const observed = Date.now();
      setNow(observed);
      if (observed >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [sentTo, retryAt]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setFeedback(undefined);
    try { await work(); }
    catch (error) { setFeedback(emailAuthMessage(error)); }
    finally { setBusy(false); }
  }

  async function sendEmail() {
    const address = sentTo || email.trim();
    const { error } = await supabase!.auth.signInWithOtp({
      email: address, options: { emailRedirectTo: authCallbackUrl },
    });
    if (error) throw error;
    setCode('');
    setSentTo(address);
    const sentAt = Date.now();
    setNow(sentAt);
    setRetryAt(sentAt + 60000);
  }

  async function confirmCode() {
    const { error } = await supabase!.auth.verifyOtp({ email: sentTo, token: code, type: 'email' });
    if (error) throw error;
  }

  async function oauth(provider: 'apple' | 'google') {
    const { data, error } = await supabase!.auth.signInWithOAuth({
      provider, options: { redirectTo: authCallbackUrl, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw error ?? Error();
    const result = await WebBrowser.openAuthSessionAsync(data.url, authCallbackUrl);
    if (result.type !== 'success') return;
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw Error();
    await completeAuthCode(code);
  }

  return <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
    <View style={ui.row}>
      <Text style={ui.title}>{t.app}</Text>
      <Button muted onPress={() => setLocale(locale === 'tr' ? 'en' : 'tr')}>{locale === 'tr' ? 'EN' : 'TR'}</Button>
    </View>
    {!supabase ? <Text style={ui.warning}>{t.missingConfig}</Text> : <View style={ui.card}>
      <Text accessibilityRole="header" style={ui.heading}>{t.signInTitle}</Text>
      {googleEnabled && <Button muted disabled={busy} onPress={() => void run(() => oauth('google'))}>{t.google}</Button>}
      {appleEnabled && <Button muted disabled={busy} onPress={() => void run(() => oauth('apple'))}>{t.apple}</Button>}
      {sentTo ? <>
        <Text accessibilityLiveRegion="polite" style={ui.small}>{t.emailSent}</Text>
        <Text selectable style={ui.accent}>{sentTo}</Text>
        <Field label={t.code} value={code} editable={!busy} autoFocus keyboardType="number-pad"
          autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10}
          style={[ui.input, authStyles.code]} onChangeText={value => setCode(value.replace(/\D/g, ''))} />
        <Button disabled={busy || !/^\d{6,10}$/.test(code)} onPress={() => void run(confirmCode)}>{t.confirmCode}</Button>
        <View style={authStyles.codeActions}>
          <View style={authStyles.action}><Button compact muted disabled={busy || resendSeconds > 0} onPress={() => void run(sendEmail)}>
            {t.resend}{resendSeconds ? ` · ${resendSeconds} ${t.secondsShort}` : ''}
          </Button></View>
          <View style={authStyles.action}><Button compact muted disabled={busy} onPress={() => {
            setSentTo('');
            setCode('');
            setFeedback(undefined);
          }}>{t.changeEmail}</Button></View>
        </View>
      </> : <>
        <Text style={ui.small}>{t.emailPrompt}</Text>
        <Field label={t.email} value={email} editable={!busy} autoCapitalize="none" autoComplete="email" keyboardType="email-address"
          onChangeText={setEmail} />
        <Button disabled={busy || !email.includes('@')} onPress={() => void run(sendEmail)}>{t.sendEmail}</Button>
      </>}
      {feedback && <Text accessibilityLiveRegion="polite" style={ui.warning}>{t[feedback]}</Text>}
    </View>}
    <View style={ui.card}>
      <Text style={ui.heading}>{t.privacy}</Text><Text style={ui.small}>{t.privacyBody}</Text>
      <PrivacyLink locale={locale} t={t} />
    </View>
  </ScrollView>;
}

const authStyles = StyleSheet.create({
  code: { textAlign: 'center', fontSize: 22, letterSpacing: 4, fontVariant: ['tabular-nums'] },
  codeActions: { flexDirection: 'row', gap: 6 },
  action: { flex: 1, minWidth: 0 },
});

export function watchSession(setSession: (session: Session | null) => void, ready: () => void) {
  if (!supabase) { ready(); return; }
  const client = supabase;
  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    ready();
  });
  const refresh = (state: string) => {
    if (state === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  };
  if (AppState.currentState) refresh(AppState.currentState);
  const listener = AppState.addEventListener('change', refresh);
  return () => { subscription.unsubscribe(); listener.remove(); void client.auth.stopAutoRefresh(); };
}
