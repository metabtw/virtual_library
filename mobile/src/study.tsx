import { useQuery } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { Image, ImageBackground, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { leaderboard, studySummary } from './api';
import { avatarAssets } from './asset-art';
import { dressedAvatar } from './cosmetics';
import type { ItemId, Profile } from './model';
import { avatarPng } from './scene';
import { message, type Translation } from './strings';
import { roomThemes } from './themes';
import { Button, ui } from './ui';

export function LeaderboardModal({ user, close, t, pending, changeVisibility }: {
  user: string; close: () => void; t: Translation; pending: boolean; changeVisibility: (visible: boolean) => void;
}) {
  const ranking = useQuery({ queryKey: ['leaderboard', user], queryFn: leaderboard, staleTime: 0 });
  const list = ranking.data;
  return <Modal transparent onRequestClose={close} accessibilityViewIsModal>
    <View style={ui.modal}><View style={[ui.card, styles.sheet]}>
      <Text style={ui.heading}>{t.leaderboard}</Text>
      {ranking.isPending ? <Text style={ui.small}>{t.loading}</Text>
        : ranking.isError ? <>
          <Text style={ui.warning}>{message(t, ranking.error)}</Text>
          <Button muted onPress={() => void ranking.refetch()}>{t.retry}</Button>
        </> : list && <>
          <Text style={ui.small}>{list.starts} – {list.ends} · {t.istanbulTime}</Text>
          <Text style={ui.small}>{t.rankingInfo}</Text>
          <Text style={ui.accent}>{t.rankingPrizes}</Text>
          <Button muted disabled={pending} onPress={() => changeVisibility(!list.visible)}>
            {list.visible ? t.rankingLeave : t.rankingJoin}
          </Button>
          {list.own && <Text style={ui.accent}>{t.rankingPosition} {list.own.rank} · {list.own.minutes} {t.minuteUnit}</Text>}
          <ScrollView style={styles.rankingScroll} contentContainerStyle={styles.rows}>
            {list.rows.length === 0 && <Text style={ui.small}>{t.rankingEmpty}</Text>}
            {list.rows.map((row, index) =>
              <View key={row.name + index} style={[ui.row, styles.row]}>
                <Text style={styles.rowName}>{row.rank} · {row.name}</Text>
                <Text style={ui.accent}>{row.minutes} {t.minuteUnit}</Text>
              </View>)}
          </ScrollView>
        </>}
      <Button muted onPress={close}>{t.done}</Button>
    </View></View>
  </Modal>;
}

export function StudyCardModal({ user, profile, equipment, close, t }: {
  user: string; profile: Profile; equipment: ItemId[]; close: () => void; t: Translation;
}) {
  const summary = useQuery({ queryKey: ['studySummary', user], queryFn: studySummary, staleTime: 0 });
  const avatar = useMemo(() => avatarPng(dressedAvatar(profile.avatar, equipment)), [profile.avatar, equipment]);
  const card = useRef<View>(null);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);

  async function share() {
    if (!card.current || !summary.data || sharing) return;
    setSharing(true);
    setShareError(false);
    let image;
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error();
      image = await captureRef(card, { format: 'png', result: 'tmpfile', width: 720, height: 1280 });
      await Sharing.shareAsync(image, { mimeType: 'image/png', dialogTitle: t.studyCard, UTI: 'public.png' });
    } catch {
      if (image) releaseCapture(image);
      setShareError(true);
    } finally {
      setSharing(false);
    }
  }

  return <Modal transparent onRequestClose={close} accessibilityViewIsModal>
    <View style={ui.modal}><View style={[ui.card, styles.sheet]}>
      <Text style={ui.heading}>{t.studyCard}</Text>
      {summary.isPending ? <Text style={ui.small}>{t.loading}</Text>
        : summary.isError ? <>
          <Text style={ui.warning}>{message(t, summary.error)}</Text>
          <Button muted onPress={() => void summary.refetch()}>{t.retry}</Button>
        </> : <ScrollView contentContainerStyle={styles.cardScroll}>
          <View ref={card} collapsable={false} style={styles.capture}>
            <ImageBackground source={roomThemes.classic.image} onLoadEnd={() => setBackgroundLoaded(true)} style={styles.poster}>
              <View style={styles.frame}>
                <View style={styles.brandRow}>
                  <Image source={require('../../public/app-logo.png')} style={styles.logo}
                    accessible={false} onLoad={() => setLogoLoaded(true)} />
                  <Text style={styles.brand}>{t.app}</Text>
                </View>
                <Image source={avatar ? { uri: avatar } : avatarAssets[profile.avatar.gender]} style={styles.avatar}
                  accessible={false} resizeMode="contain" onLoadEnd={() => setAvatarLoaded(true)} />
                <Text style={styles.reader} numberOfLines={1}>{profile.name}</Text>
                <View style={styles.stat}>
                  <Text style={styles.minutes}>{summary.data.minutes}</Text>
                  <Text style={styles.copy}>{t.studyToday}</Text>
                </View>
                <Text style={styles.streak}>{summary.data.streak} {t.studyStreak}</Text>
                <Text style={styles.copy}>{summary.data.date}</Text>
              </View>
            </ImageBackground>
          </View>
        </ScrollView>}
      {shareError && <Text accessibilityLiveRegion="polite" style={ui.warning}>{t.shareError}</Text>}
      <Button disabled={!summary.data || !avatarLoaded || !backgroundLoaded || !logoLoaded || sharing} onPress={() => void share()}>
        {sharing ? t.loading : t.downloadCard}
      </Button>
      <Button muted disabled={sharing} onPress={close}>{t.done}</Button>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  sheet: { width: '100%', maxWidth: 440, maxHeight: '94%' },
  rankingScroll: { flexGrow: 0 },
  rows: { gap: 4 },
  row: { minHeight: 40, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#6e5066' },
  rowName: { flex: 1, color: '#fff0dc', fontWeight: '600' },
  cardScroll: { alignItems: 'center' },
  capture: { width: '100%', maxWidth: 320, aspectRatio: 9 / 16, backgroundColor: '#261827' },
  poster: { flex: 1, padding: '7%', justifyContent: 'center' },
  frame: { flex: 1, borderWidth: 1, borderRadius: 14, borderColor: '#d09369', backgroundColor: '#251a2ce8',
    padding: 10, alignItems: 'center', justifyContent: 'space-evenly' },
  brandRow: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  logo: { width: 53, height: 53 },
  brand: { color: '#ffd9ac', textAlign: 'center', fontSize: 14, fontWeight: '800', flexShrink: 1 },
  avatar: { width: '46%', height: '29%' },
  reader: { color: '#fff0dc', fontWeight: '700', textAlign: 'center', fontSize: 18 },
  stat: { alignItems: 'center', justifyContent: 'center' },
  minutes: { color: '#ffc275', fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'] },
  streak: { color: '#d5efb8', fontWeight: '700', textAlign: 'center', fontSize: 15 },
  copy: { fontSize: 12, color: '#e8c8b0', textAlign: 'center' },
});
