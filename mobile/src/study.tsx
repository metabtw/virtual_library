import { useQuery } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { Image, ImageBackground, Modal, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { leaderboard, studySummary } from './api';
import { avatarAssets } from './asset-art';
import { dressedAvatar } from './cosmetics';
import type { ItemId, Profile } from './model';
import { avatarPng } from './scene';
import { message, type Translation } from './strings';
import { roomThemes } from './themes';
import type { PairGoal } from '../../public/study-together';
import { Button, Options, ui } from './ui';

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

export function StudyCardModal({ user, profile, equipment, close, partner, t }: {
  user: string; profile: Profile; equipment: ItemId[]; close: () => void; partner?: PairGoal; t: Translation;
}) {
  const summary = useQuery({ queryKey: ['studySummary', user], queryFn: studySummary, staleTime: 0, enabled: !partner });
  const avatar = useMemo(() => avatarPng(dressedAvatar(profile.avatar, equipment)), [profile.avatar, equipment]);
  const friendAvatar = useMemo(() => partner?.partnerAvatar ? avatarPng(partner.partnerAvatar) : undefined, [partner]);
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');
  const [visible, setVisible] = useState({ name: true, minutes: true, streak: true, topics: false });
  const [friendLoaded, setFriendLoaded] = useState(false);
  const week = mode === 'weekly' ? summary.data?.week : undefined;
  const card = useRef<View>(null);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);

  async function share() {
    if (!card.current || (!summary.data && !partner) || sharing) return;
    setSharing(true);
    setShareError(false);
    let image;
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error();
      image = await captureRef(card, { format: 'png', result: 'tmpfile', width: 720, height: 1280 });
      await Sharing.shareAsync(image, { mimeType: 'image/png', dialogTitle: t.studyCard, UTI: 'public.png' });
    } catch {
      setShareError(true);
    } finally {
      if (image) releaseCapture(image);
      setSharing(false);
    }
  }

  return <Modal transparent onRequestClose={close} accessibilityViewIsModal>
    <View style={ui.modal}><View style={[ui.card, styles.sheet]}>
      <Text style={ui.heading}>{t[partner ? 'pairShare' : 'studyCard']}</Text>
      {!partner && summary.isPending ? <Text style={ui.small}>{t.loading}</Text>
        : !partner && summary.isError ? <>
          <Text style={ui.warning}>{message(t, summary.error)}</Text>
          <Button muted onPress={() => void summary.refetch()}>{t.retry}</Button>
        </> : <ScrollView contentContainerStyle={styles.cardScroll}>
          {!partner && summary.data && <View style={styles.options}>
            {summary.data.week && <Options label={t.studyCardAction} values={[['daily',t.cardDaily],['weekly',t.cardWeekly]] as const}
              value={mode} onChange={setMode} />}
            {(['name','minutes',week ? 'topics' : 'streak'] as const).map(field => {
              const label = t[({ name:'cardName',minutes:'cardMinutes',topics:'cardTopics',streak:'cardStreak' })[field] as keyof Translation];
              return <View style={styles.switchRow} key={field}><Text style={ui.small}>{label}</Text>
                <Switch accessibilityLabel={label} value={visible[field]} onValueChange={value => setVisible(previous => ({ ...previous,[field]:value }))} /></View>;
            })}
          </View>}
          <View ref={card} collapsable={false} style={styles.capture}>
            <ImageBackground source={roomThemes.classic.image} onLoadEnd={() => setBackgroundLoaded(true)} style={styles.poster}>
              <View style={styles.frame}>
                <View style={styles.brandRow}>
                  <Image source={require('../../public/app-logo.png')} style={styles.logo}
                    accessible={false} onLoad={() => setLogoLoaded(true)} />
                  <Text style={styles.brand}>{t.app}</Text>
                </View>
                <View style={styles.avatars}>
                  <Image source={avatar ? { uri: avatar } : avatarAssets[profile.avatar.gender]} style={styles.avatar}
                    accessible={false} resizeMode="contain" onLoadEnd={() => setAvatarLoaded(true)} />
                  {partner?.partnerAvatar && <Image source={friendAvatar ? { uri: friendAvatar } : avatarAssets[partner.partnerAvatar.gender]}
                    style={styles.avatar} accessible={false} resizeMode="contain" onLoadEnd={() => setFriendLoaded(true)} />}
                </View>
                {(partner || visible.name) && <Text style={styles.reader} numberOfLines={1}>{partner ? profile.name + ' & ' + partner.friend : profile.name}</Text>}
                <View style={styles.stat}>
                  {(partner || visible.minutes) && <Text style={styles.minutes}>{partner ? partner.progress + ' / ' + partner.target : week?.minutes ?? summary.data?.minutes}</Text>}
                  <Text style={styles.copy}>{t[partner ? 'pairComplete' : week ? 'cardWeeklyName' : 'studyToday']}</Text>
                </View>
                {week && visible.topics && week.topics.map(topic => <Text key={topic} numberOfLines={1} style={styles.copy}>{topic}</Text>)}
                {!partner && !week && visible.streak && <Text style={styles.streak}>{summary.data?.streak} {t.studyStreak}</Text>}
                <Text style={styles.copy}>{partner?.week ?? (week ? week.starts + ' – ' + week.ends : summary.data?.date)}</Text>
              </View>
            </ImageBackground>
          </View>
        </ScrollView>}
      {shareError && <Text accessibilityLiveRegion="polite" style={ui.warning}>{t.shareError}</Text>}
      <Button disabled={(!summary.data && !partner) || (!!partner && !friendLoaded) || !avatarLoaded || !backgroundLoaded || !logoLoaded || sharing} onPress={() => void share()}>
        {sharing ? t.loading : t.cardShare}
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
  options: { width:'100%', gap:4, marginBottom:8 },
  switchRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', gap:6 },
  avatars: { height:'25%', width:'100%', flexDirection:'row', justifyContent:'center', gap:8 },
  avatar: { width: '41%', height: '100%' },
  reader: { color: '#fff0dc', fontWeight: '700', textAlign: 'center', fontSize: 18 },
  stat: { alignItems: 'center', justifyContent: 'center' },
  minutes: { color: '#ffc275', fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'] },
  streak: { color: '#d5efb8', fontWeight: '700', textAlign: 'center', fontSize: 15 },
  copy: { fontSize: 12, color: '#e8c8b0', textAlign: 'center' },
});
