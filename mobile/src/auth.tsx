import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, Text, View } from 'react-native';
import { authCallbackUrl, completeAuthCode, supabase } from './api';
import { Button, Field, ui } from './ui';
import { usePreferences, words, type Locale, type Translation } from './strings';

const appleEnabled = process.env.EXPO_PUBLIC_AUTH_APPLE === 'true';
const googleEnabled = process.env.EXPO_PUBLIC_AUTH_GOOGLE === 'true';
const codeEnabled = process.env.EXPO_PUBLIC_AUTH_EMAIL_CODE === 'true';
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
  const [sent, setSent] = useState(false);
  const [resendLocked, setResendLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!resendLocked) return;
    const timer = setTimeout(() => setResendLocked(false), 60000);
    return () => clearTimeout(timer);
  }, [resendLocked]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    try { await work(); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }

  async function sendEmail() {
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(), options: { emailRedirectTo: authCallbackUrl },
    });
    if (error) throw error;
    setCode('');
    setSent(true);
    setResendLocked(true);
  }

  async function confirmCode() {
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
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
      <Field label={t.email} value={email} autoCapitalize="none" autoComplete="email" keyboardType="email-address"
        onChangeText={value => { setEmail(value); setSent(false); }} />
      {sent && <>
        <Text accessibilityLiveRegion="polite" style={ui.small}>{codeEnabled ? t.emailSent : t.emailLinkSent}</Text>
        {codeEnabled && <Field label={t.code} value={code} onChangeText={setCode} keyboardType="number-pad"
          autoComplete="one-time-code" maxLength={10} />}
      </>}
      {!sent && <Button disabled={busy || !email.includes('@')}
        onPress={() => void run(sendEmail)}>{t.sendCode}</Button>}
      {sent && codeEnabled && <Button disabled={busy || !/^\d{6,10}$/.test(code.trim())}
        onPress={() => void run(confirmCode)}>{t.signIn}</Button>}
      {sent && <Button muted disabled={busy || resendLocked} onPress={() => void run(sendEmail)}>{t.resend}</Button>}
      {appleEnabled && <Button muted disabled={busy} onPress={() => void run(() => oauth('apple'))}>{t.apple}</Button>}
      {googleEnabled && <Button muted disabled={busy} onPress={() => void run(() => oauth('google'))}>{t.google}</Button>}
      {failed && <Text accessibilityLiveRegion="polite" style={ui.warning}>{t.authError}</Text>}
    </View>}
    <View style={ui.card}>
      <Text style={ui.heading}>{t.privacy}</Text><Text style={ui.small}>{t.privacyBody}</Text>
      <PrivacyLink locale={locale} t={t} />
    </View>
  </ScrollView>;
}

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
