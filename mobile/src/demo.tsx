import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ImageBackground, ScrollView, StyleSheet, Text, View } from 'react-native';
import { defaultAvatar } from '../../public/avatar-art';
import { demoClock, demoDurations, demoError, type DemoAccess, type DemoState } from '../../public/demo';
import { demoEvent, readDemoAccess, startDemo, writeDemoAccess } from './api';
import { TourSheet } from './arrival';
import { Games } from './games';
import { Sprite } from './scene';
import type { Locale, Translation } from './strings';
import { roomThemes } from './themes';
import { Button, Options, ui } from './ui';

export function Demo({ locale, t, register }: { locale: Locale; t: Translation; register: (hasDemo: boolean) => void }) {
  const access = useRef<DemoAccess | null>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const [ready, setReady] = useState(false);
  const [sample, setSample] = useState<{ data: DemoState; at: number }>();
  const [pending, setPending] = useState(false);
  const [time, setTime] = useState(Date.now);
  const [duration, setDuration] = useState(25);
  const [error, setError] = useState<keyof Translation>();
  const [tour, setTour] = useState(false);
  const [games, setGames] = useState(false);

  const run = useCallback(async (operation: string, minutes = 25) => {
    if (!active.current || busy.current || (!access.current && operation !== 'create')) return false;
    busy.current = true;
    if (operation !== 'state') setPending(true);
    try {
      const data = operation === 'create' ? await startDemo() : await demoEvent(access.current!, operation, minutes);
      if (operation === 'create' && 'key' in data && typeof data.key === 'string') {
        access.current = { id: data.id, key: data.key };
        await writeDemoAccess(access.current);
      }
      if (!active.current) return false;
      const at = Date.now();
      setSample({ data, at });
      setTime(at);
      setError(previous => data.outcome === 'invalid' || (operation === 'state' && previous === 'demoInvalid')
        ? 'demoInvalid' : undefined);
      if (operation === 'create') setTour(true);
      return true;
    } catch (failure) {
      if (!active.current) return false;
      const key = demoError(failure);
      setError(key);
      if (key === 'demoMissing') {
        access.current = null;
        setSample(undefined);
        void writeDemoAccess(null).catch(() => {});
      }
      return false;
    } finally {
      busy.current = false;
      if (active.current && operation !== 'state') setPending(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    let alive = true;
    const poll = () => {
      if (AppState.currentState === 'active') void run('state');
    };
    void readDemoAccess().then(result => {
      if (!alive) return;
      access.current = result;
      return run('state');
    }).catch(() => { if (alive) setError('server'); }).finally(() => { if (alive) setReady(true); });
    const foreground = AppState.addEventListener('change', poll);
    const refresh = setInterval(poll, 8000);
    return () => {
      alive = active.current = false;
      foreground.remove();
      clearInterval(refresh);
    };
  }, [run]);

  const demo = sample?.data;
  const expiresAt = demo?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const clock = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [expiresAt]);
  const now = sample ? sample.data.now + time - sample.at : 0;
  const expired = Boolean(demo && now >= demo.expiresAt);
  const needsCheck = !!(demo?.verifyAt && demo.endAt && demo.verifyAt < demo.endAt && now >= demo.verifyAt);

  async function leave(next: 'games' | 'register') {
    if (needsCheck) return;
    if (demo?.endAt && !await run('stop')) return;
    if (next === 'register') register(Boolean(access.current));
    else setGames(value => !value);
  }

  return <ScrollView contentContainerStyle={ui.content}>
    <View style={ui.card}>
      <Text accessibilityRole="header" style={ui.heading}>{t.demoTitle}</Text>
      {!demo && <Button compact muted disabled={pending} onPress={() => register(Boolean(access.current))}>{t.signInTitle}</Button>}
      <ImageBackground source={roomThemes.classic.image} style={styles.scene} imageStyle={styles.room}>
        <Sprite avatar={defaultAvatar} width={59} />
        <Text style={styles.name}>{t.demoName}</Text>
      </ImageBackground>
      <Text style={ui.small}>{t.demoIntro}</Text>
      {error && <Text accessibilityLiveRegion="polite" style={ui.warning}>{t[error]}</Text>}
      {demo ? <>
        <Text style={ui.small}>{t.demoId}</Text>
        <Text selectable style={ui.accent}>{demo.id}</Text>
        <Text style={ui.small}>{t.demoTime} · {demoClock(demo.expiresAt - now)}</Text>
        <Text style={ui.accent}>{t.demoTracked} · {demo.minutes} {t.minuteUnit}</Text>
        {demo.endAt ? <>
          <Text style={ui.title}>{demoClock(demo.endAt - now)}</Text>
          {needsCheck && <Button disabled={pending} onPress={() => void run('verify')}>
            {t.here} · {demoClock(demo.verifyAt! + 30000 - now)}
          </Button>}
          <Button muted disabled={pending || needsCheck} onPress={() => void run('stop')}>{t.demoStop}</Button>
        </> : expired ? <Text style={ui.small}>{t.demoExpired}</Text> : !games && <>
          <Options label={t.focus} values={demoDurations.map(value => [value, `${value} ${t.minuteUnit}`] as const)}
            value={duration} onChange={setDuration} />
          <Button disabled={pending} onPress={() => void run('start', duration)}>{t.start}</Button>
        </>}
      </> : <Button disabled={!ready || pending} onPress={() => void run(access.current ? 'state' : 'create')}>
        {access.current ? t.demoRetry : t.demoCreate}
      </Button>}
      <Button muted onPress={() => setTour(true)}>{t.tourOpen}</Button>
      {!!demo && !expired && <Button muted disabled={pending || needsCheck} onPress={() => void leave('games')}>{t.games}</Button>}
      {!!demo && <Button disabled={pending || needsCheck} onPress={() => void leave('register')}>{t.demoRegister}</Button>}
    </View>
    {games && !expired && <Games locale={locale} t={t} />}
    {tour && <TourSheet t={t} finish={() => setTour(false)} pending={false} error="" />}
  </ScrollView>;
}

const styles = StyleSheet.create({
  scene: { height: 158, alignItems: 'center', justifyContent: 'center', gap: 5 },
  room: { borderRadius: 12, opacity: .75 },
  name: { color: '#fdf0dd', backgroundColor: '#211526', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
});
