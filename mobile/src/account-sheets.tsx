import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { requestAccountDeletion, deleteAccount } from './api';
import { PolicyLinks } from './auth';
import { message, type Locale, type Translation } from './strings';
import { Button, Field, ui } from './ui';

export type AccountPanel = 'data' | 'leave' | 'signOut' | 'delete' | 'code';

export function AccountSheet({ panel, change, confirm, deleted, leaveCopy, inRoom, locale, t }: {
  panel: AccountPanel;
  change: (next: AccountPanel | null) => void;
  confirm: (action: 'leave' | 'signOut') => void;
  deleted: () => Promise<void>;
  leaveCopy: string;
  inRoom: boolean;
  locale: Locale;
  t: Translation;
}) {
  const [busy, setBusy] = useState(false);
  const close = () => { if (!busy) change(null); };
  const activate = () => {
    if (panel === 'delete') change('code');
    else if (panel === 'leave' || panel === 'signOut') confirm(panel);
  };
  const signOutCopy = inRoom ? t.confirmSignOut + '\n\n' + t.signOutRoom : t.confirmSignOut;
  const titles = { data: t.myData, leave: t.leave, signOut: t.signOut, delete: t.deleteAccount, code: t.deletionCodeTitle };

  return <Modal visible transparent onRequestClose={close} accessibilityViewIsModal>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={ui.modal}>
      <View style={[ui.card, styles.sheet]}>
        <Text accessibilityRole="header" style={ui.heading}>{titles[panel]}</Text>
        {panel === 'data' ? <>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.copy}>{t.privacyBody}</Text>
            <PolicyLinks locale={locale} t={t} />
          </ScrollView>
          <Button muted onPress={close}>{t.goBack}</Button>
          <Button tone="danger" onPress={() => change('delete')}>{t.deleteAccount}</Button>
        </> : panel === 'code' ? <DeletionCode t={t} close={close} busy={busy} setBusy={setBusy} deleted={deleted} /> : <>
          <Text style={styles.copy}>{panel === 'leave' ? leaveCopy : panel === 'signOut' ? signOutCopy : t.confirmDelete}</Text>
          <Button muted onPress={close}>{t.cancel}</Button>
          <Button tone="danger" onPress={activate}>{panel === 'delete' ? t.sendDeletionCode : titles[panel]}</Button>
        </>}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function DeletionCode({ t, close, busy, setBusy, deleted }: {
  t: Translation; close: () => void; busy: boolean; setBusy: (busy: boolean) => void; deleted: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<{ challenge: string; expiresAt: number }>();
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');
  const started = useRef(false);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const valid = challenge && challenge.expiresAt > now;

  async function send() {
    setBusy(true);
    setCode('');
    setError('');
    try {
      setChallenge(await requestAccountDeletion());
      setRetryAt(Date.now() + 60000);
    } catch (error) {
      if (error instanceof Error && error.message === 'emailRateLimited') setRetryAt(Date.now() + 60000);
      setError(message(t, error));
    } finally {
      setNow(Date.now());
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send();
  }, []);
  useEffect(() => {
    if (!challenge && !retryAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [challenge, retryAt]);

  async function submit() {
    if (!valid || busy || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError('');
    try {
      await deleteAccount(challenge.challenge, code);
      await deleted();
    } catch (error) {
      setCode('');
      setError(message(t, error));
    } finally { setBusy(false); }
  }

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    {challenge && <Text style={styles.copy}>{t.deletionCodeInstructions}</Text>}
    <Field label={t.code} value={code} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code"
      editable={!!valid && !busy} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
      maxLength={6} style={[ui.input, styles.code]} />
    {(error || (challenge && !valid)) && <Text accessibilityLiveRegion="polite" style={ui.warning}>{error || t.deletionCodeExpired}</Text>}
    <Button tone="danger" disabled={busy || !valid || !/^\d{6}$/.test(code)} onPress={() => void submit()}>{t.deleteAccount}</Button>
    <Button muted disabled={busy || seconds > 0} onPress={() => void send()}>
      {challenge ? t.newDeletionCode : t.sendDeletionCode}{seconds ? ' · ' + seconds + ' s' : ''}
    </Button>
    <Button muted disabled={busy} onPress={close}>{t.cancel}</Button>
  </ScrollView>;
}

const styles = StyleSheet.create({
  sheet: { width: '100%', maxWidth: 420, maxHeight: '94%' },
  content: { gap: 9, paddingBottom: 3 },
  copy: { color: '#dfc2b6', fontSize: 15, lineHeight: 22 },
  code: { textAlign: 'center', fontSize: 23, letterSpacing: 4 },
});
