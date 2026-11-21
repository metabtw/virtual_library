import type { RealtimeChannel } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { hairStyles } from '../../public/avatar-art';
import { focusRemaining, markServerTime, serverTimeAt, verificationRemaining } from '../../public/focus-clock';
import { deleteAccount, library, supabase } from './api';
import type { Avatar, Command, Drop, Focus, Member, Profile } from './model';
import { RoomScene, Sprite } from './scene';
import { allowReminders, syncRemoteReminders, removeRemoteReminders, useReminder } from './reminders';
import { hasAnalytics, setUsageMeasurement, trackUsage } from './telemetry';
import { message, usePreferences, words, type Locale, type Translation } from './strings';
import { Button, Field, Options, ui } from './ui';
import { Boxes, Directory, Invite, RoomGoal, TargetEditor } from './clubs';
import { Ambience } from './ambience';
import { Catalog, ItemIllustration } from './catalog';
import { dressedAvatar } from './cosmetics';
import { ThemePicker } from './themes';
import { LeaderboardModal, StudyCardModal } from './study';

type Action = { [K in keyof Command]: { name: K; payload?: Command[K] } }[keyof Command];

const baseAvatar: Avatar = { gender: 'unspecified', hair: 0, outfit: 0, color: '#bd7050' };
const minute = 60000;

function AvatarEditor({ profile, onSave, pending, t, locale }: {
  profile: Profile | null; onSave: (data: Command['profile']) => void;
  pending: boolean; t: Translation; locale: Locale;
}) {
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? baseAvatar);
  return <View style={ui.card}>
    <Text style={ui.heading}>{profile ? t.editAvatar : t.newAvatar}</Text>
    <View style={{ alignSelf: 'center' }}><Sprite avatar={avatar} width={90} /></View>
    <Field label={t.name} value={name} onChangeText={setName} maxLength={24} />
    <Options label={t.gender} value={avatar.gender}
      values={(['unspecified', 'female', 'male'] as const).map(value => [value, t[value]])}
      onChange={gender => setAvatar({ ...avatar, gender })} />
    <Options label={t.hair} value={avatar.hair} values={hairStyles[avatar.gender][locale].map((name, i) => [i, name])}
      onChange={hair => setAvatar({ ...avatar, hair })} />
    <Options label={t.outfit} value={avatar.outfit} values={[t.sweater, t.shirt, t.cardigan].map((name, i) => [i, name])}
      onChange={outfit => setAvatar({ ...avatar, outfit })} />
    <Options label={t.color} value={avatar.color}
      values={[['#bd7050', t.cinnamon], ['#789078', t.sage], ['#7988ab', t.midnight], ['#ad7963', t.coffee]]}
      onChange={color => setAvatar({ ...avatar, color })} />
    <Button disabled={pending || name.trim().length < 2} onPress={() => onSave({ ...avatar, name })}>{t.save}</Button>
  </View>;
}

function Period({ focus, remaining, pending, onAction, t, canStart }: {
  focus: Focus | null; remaining: number; pending: boolean; onAction: (action: Action) => void;
  t: Translation; canStart: boolean;
}) {
  const preferred = usePreferences(s => s.duration);
  const remember = usePreferences(s => s.setDuration);
  const [duration, setDuration] = useState(preferred);
  const chooseDuration = (value: string) => {
    setDuration(value);
    if (/^\d{1,3}$/.test(value) && Number(value) >= 5 && Number(value) <= 180) remember(value);
  };
  const value = Number(duration);
  const valid = /^\d{1,3}$/.test(duration) && value >= 5 && value <= 180;
  const seconds = focus ? Math.max(0, Math.ceil(remaining / 1000)) : valid ? value * 60 : 0;
  const time = [Math.floor(seconds / 60), seconds % 60].map(part => String(part).padStart(2, '0')).join(':');
  const paused = focus?.paused_at != null;
  return <View style={ui.card}>
    <View style={ui.row}>
      <Text style={ui.heading}>{t.focus}</Text>
      <Text style={ui.timer}>{time}</Text>
    </View>
    {focus ? <Button disabled={pending || (paused && !canStart)} onPress={() =>
      onAction({ name: 'status', payload: { status: paused ? 'desk' : 'break' } })}>
      {paused ? t.resume : t.pause}
    </Button> : <>
      <Options label={t.focus} value={duration} values={['25', '50', '90'].map(value => [value, value])} onChange={chooseDuration} />
      <Field label={t.duration} keyboardType="number-pad" value={duration} onChangeText={chooseDuration} maxLength={3} />
      <Button disabled={pending || !valid || !canStart} onPress={() => onAction({ name: 'start', payload: { duration: value } })}>
        {t.start}
      </Button>
    </>}
    {paused && <Button muted disabled={pending} onPress={() => Alert.alert(t.abandon, t.abandonConfirm, [
      { text: t.cancel, style: 'cancel' },
      { text: t.abandon, style: 'destructive', onPress: () => onAction({ name: 'abandon' }) },
    ])}>{t.abandon}</Button>}
  </View>;
}

export function Library({ id }: { id: string }) {
  const { locale, setLocale, page, setPage, alerts, setAlerts, usage, setUsage, theme, setTheme } = usePreferences();
  const t = words[locale];
  const [prize, setPrize] = useState<Drop | null>(null);
  const [editing, setEditing] = useState(false);
  const [moment, setMoment] = useState(() => performance.now());
  const [foreground, setForeground] = useState((AppState.currentState ?? 'active') === 'active');
  const [refreshAfter, setRefreshAfter] = useState(0);
  const lastServerTime = useRef(0);
  const [pendingPauseAt, setPendingPauseAt] = useState<number>();
  const [peer, setPeer] = useState<Member>();
  const [rankingOpen, setRankingOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [reactionMessage, setReactionMessage] = useState('');
  const reactionTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seenReactions = useRef(new Set<string>());
  const [actionError, setActionError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const presence = useRef<RealtimeChannel | null>(null);
  const queryClient = useQueryClient();
  const key = ['library', id] as const;
  const query = useQuery({
    queryKey: key, queryFn: () => library('state'),
    refetchInterval: query => query.state.data?.profile?.room || query.state.data?.session?.state === 'active' ? 1000 : 5000,
  });
  const snapshot = query.data;
  const inventory = snapshot?.inventory;
  const equipped = useMemo(() => inventory?.filter(item => item.placed).map(item => item.item) ?? [], [inventory]);
  const serverSample = snapshot?.now;
  const clock = useMemo(() => serverSample === undefined ? undefined : markServerTime(serverSample, query.dataUpdatedAt),
    [serverSample, query.dataUpdatedAt]);
  useEffect(() => { lastServerTime.current = serverSample ?? 0; }, [serverSample]);
  const localRoom = snapshot?.profile?.room;
  const focus = snapshot?.session?.state === 'active' ? snapshot.session : null;
  const running = focus?.paused_at === null;
  const effectivePage = running || (page === 'room' && localRoom) ? 'room' : page === 'room' ? 'rooms' : page;
  const observed = clock ? serverTimeAt(clock, moment) : 0;
  const remainingCheck = foreground && (serverSample ?? 0) > refreshAfter ? verificationRemaining(focus, observed) : 0;
  const verify = remainingCheck > 0;
  useReminder(alerts, focus?.next_check_at ?? null, clock, t);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => {
      setForeground(status === 'active');
      if (status === 'active') {
        setRefreshAfter(lastServerTime.current);
        setMoment(performance.now());
        void queryClient.invalidateQueries({ queryKey: ['library', id] }, { cancelRefetch: false });
      }
    });
    return () => subscription.remove();
  }, [id, queryClient]);
  useEffect(() => {
    const incoming = (snapshot?.reactions ?? []).filter(event => !seenReactions.current.has(event.id));
    if (!incoming.length) return;
    for (const event of incoming) seenReactions.current.add(event.id);
    if (seenReactions.current.size > 128) {
      for (const key of [...seenReactions.current].slice(0, 64)) seenReactions.current.delete(key);
    }
    setReactionMessage(incoming.map(event =>
      `${event.kind === 'coffee' ? '☕' : '👏'} ${event.name} ${event.kind === 'coffee' ? t.coffeeReceived : t.clapReceived}`).join(' · '));
    clearTimeout(reactionTimeout.current);
    reactionTimeout.current = setTimeout(() => setReactionMessage(''), 5000);
  }, [snapshot?.reactions, t]);
  useEffect(() => () => clearTimeout(reactionTimeout.current), []);
  useEffect(() => {
    setUsageMeasurement(usage);
    return () => setUsageMeasurement(false);
  }, [usage]);
  useEffect(() => {
    if (alerts) void syncRemoteReminders(locale).catch(() => {});
  }, [alerts, locale]);

  const mutation = useMutation({
    onMutate: async () => {
      setActionError('');
      await queryClient.cancelQueries({ queryKey: key });
    },
    mutationFn: ({ name, payload }: Action) => library(name, payload),
    onSuccess: (data, action) => {
      queryClient.setQueryData(key, data);
      setMoment(performance.now());
      if (action.name === 'profile') setEditing(false);
      if (['join', 'joinCode', 'createRoom'].includes(action.name)) { setPage('room'); trackUsage('room_joined'); }
      if (action.name === 'start') trackUsage('focus_started');
      if (action.name === 'verify') trackUsage('focus_confirmed');
      if (action.name === 'leave') setPage('rooms');
      if (data.drop) setPrize(data.drop);
      if (action.name === 'react') {
        setPeer(undefined);
        setReactionMessage(t.reactionSent);
        clearTimeout(reactionTimeout.current);
        reactionTimeout.current = setTimeout(() => setReactionMessage(''), 5000);
      }
      if (action.name === 'rankingVisibility') void queryClient.invalidateQueries({ queryKey: ['leaderboard', id] });
      if (['status', 'start', 'place', 'target', 'abandon', 'react'].includes(action.name)) {
        void presence.current?.track({ changed: data.now });
      }
    },
    onError: error => setActionError(message(t, error)),
    onSettled: () => setPendingPauseAt(undefined),
  });

  useEffect(() => {
    if (!focus) return;
    const timer = setInterval(() => setMoment(performance.now()), 200);
    setMoment(performance.now());
    return () => clearInterval(timer);
  }, [Boolean(focus)]);
  useEffect(() => {
    if (!localRoom) return;
    const client = supabase!;
    const channel = client.channel(`room:${localRoom}`, { config: { private: true, presence: { key: id } } });
    presence.current = channel;
    channel.on('presence', { event: 'sync' }, () => {
      void queryClient.invalidateQueries({ queryKey: ['library', id] });
    }).subscribe(status => {
      if (status === 'SUBSCRIBED') void channel.track({ changed: Date.now() });
    });
    return () => { presence.current = null; void client.removeChannel(channel); };
  }, [id, localRoom, queryClient]);

  async function signOut(accountDeleted = false) {
    await removeRemoteReminders(accountDeleted).catch(() => {});
    setAlerts(false);
    setUsage(false);
    setUsageMeasurement(false);
    await supabase!.auth.signOut({ scope: 'local' });
    queryClient.removeQueries({ queryKey: key });
    queryClient.removeQueries({ queryKey: ['studySummary', id] });
    queryClient.removeQueries({ queryKey: ['leaderboard', id] });
    setPage('rooms');
  }

  function requestDeletion() {
    Alert.alert(t.deleteAccount, t.confirmDelete, [
      { text: t.cancel, style: 'cancel' },
      { text: t.deleteAccount, style: 'destructive', onPress: () => {
        setDeleting(true);
        void deleteAccount().then(() => signOut(true)).catch(error => setActionError(message(t, error)))
          .finally(() => setDeleting(false));
      } },
    ]);
  }

  if (!snapshot) return <View style={ui.content}>
    <Text style={ui.title}>{t.app}</Text>
    <Text style={ui.small}>{query.isError ? message(t, query.error) : t.loading}</Text>
    {query.isError && <Button onPress={() => void query.refetch()}>{t.retry}</Button>}
  </View>;

  const profile = snapshot.profile;
  const room = snapshot.rooms.find(room => room.id === localRoom);
  const aurora = (room?.minutes ?? 0) >= 500;
  const prizeItem = prize && 'item' in prize ? snapshot.items.find(item => item.id === prize.item) : undefined;
  const label = (item: { name: string; name_en: string }) => locale === 'tr' ? item.name : item.name_en;
  const pending = mutation.isPending || deleting;
  function act(action: Action) {
    if (pending) return;
    if (running && action.name === 'status' && action.payload?.status === 'break') setPendingPauseAt(observed);
    mutation.mutate(action);
  }

  return <>
    <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <View style={ui.row}>
        <Text style={[ui.title, { flexShrink: 1 }]}>{t.app}</Text>
        {profile && <Text style={ui.balance}>{profile.coins} {t.coins}</Text>}
      </View>
      {reactionMessage !== '' && <Text accessibilityLiveRegion="polite" style={ui.accent}>{reactionMessage}</Text>}
      {actionError !== '' && <Text accessibilityLiveRegion="polite" style={ui.warning}>{actionError}</Text>}
      {!profile ? <AvatarEditor profile={null} onSave={payload => act({ name: 'profile', payload })} pending={pending} t={t} locale={locale} /> :
        effectivePage === 'rooms' ? <>
          <Button muted onPress={() => setRankingOpen(true)}>{t.leaderboard}</Button>
          <Directory rooms={snapshot.rooms} current={profile.room} pending={pending}
          coins={profile.coins} locale={locale} t={t}
          join={room => room === localRoom ? setPage('room') : act({ name: 'join', payload: { room } })}
          enter={code => act({ name: 'joinCode', payload: { code } })}
          create={name => act({ name: 'createRoom', payload: { name } })} />
        </> : effectivePage === 'room' ? <>
          {room && <View style={ui.row}>
            <Text style={ui.heading}>{label(room)}</Text><Text style={ui.small}>{room.count}/{room.capacity}</Text>
          </View>}
          <RoomScene room={localRoom ?? null} members={snapshot.members} aurora={aurora} theme={theme} t={t} onDeskPress={running ? undefined : setPeer} />
          {room && !running && <ThemePicker value={theme} room={room.id} aurora={aurora} onChange={setTheme} t={t} />}
          {room && <RoomGoal minutes={room.minutes ?? 0} t={t} />}
          {room && !running && <Invite room={room} t={t} />}
          {snapshot.session?.state === 'completed' && <>
            <Text style={ui.accent}>{t.reward}</Text>
            <Button muted onPress={() => setCardOpen(true)}>{t.studyCard}</Button>
          </>}
          {snapshot.session?.state === 'invalid' && <Text style={ui.warning}>{t.invalid}</Text>}
          <Period focus={focus} remaining={focus ? focusRemaining(focus, pendingPauseAt ?? observed) : 0}
            t={t} pending={pending} canStart={Boolean(room)} onAction={act} />
          {!focus && room && <View style={ui.card}>
            <Options label={label(room)} values={([['desk', t.desk], ['break', t.break]] as const)}
              value={profile.status ?? 'desk'} onChange={status => act({ name: 'status', payload: { status } })} />
            <Button muted disabled={pending} onPress={() => act({ name: 'leave' })}>{t.leave}</Button>
          </View>}
          {room && <Ambience locked={running} inventory={snapshot.inventory} t={t} />}
        </> : effectivePage === 'shop' ?
          <Catalog snapshot={snapshot} t={t} locale={locale} pending={pending}
            action={item => act({ name: 'buy', payload: { item } })}
            boxes={<Boxes snapshot={snapshot} pending={pending} t={t} open={name => act({ name })} />} /> :
          <>
            {editing ? <AvatarEditor profile={profile} onSave={payload => act({ name: 'profile', payload })} pending={pending} t={t} locale={locale} /> :
              <View style={ui.card}>
                <View style={ui.row}><Sprite avatar={dressedAvatar(profile.avatar, equipped)} width={74} /><View style={{ flex: 1 }}>
                  <Text style={ui.heading}>{profile.name}</Text>
                  {!!profile.target && <Text numberOfLines={1} style={ui.small}>{profile.target}</Text>}
                </View></View>
                <Button disabled={pending} onPress={() => setEditing(true)}>{t.editAvatar}</Button>
              </View>}
            <TargetEditor initial={profile.target ?? ''} pending={pending} t={t} save={target => act({ name: 'target', payload: { target } })} />
            <Button muted onPress={() => setCardOpen(true)}>{t.studyCard}</Button>
            <Catalog snapshot={snapshot} inventory t={t} locale={locale} pending={pending}
              action={item => act({ name: 'place', payload: { item } })} />
          </>}
      {(!profile || effectivePage === 'profile') && <View style={ui.card}>
        <Options label="TR / EN" values={([['tr', 'Türkçe'], ['en', 'English']] as const)} value={locale} onChange={setLocale} />
        <View style={ui.row}><Text style={ui.heading}>{t.alerts}</Text><Switch accessibilityLabel={t.alerts} value={alerts}
          onValueChange={value => {
            if (value) void allowReminders().then(setAlerts).catch(() => setAlerts(false));
            else { setAlerts(false); void removeRemoteReminders().catch(error => setActionError(message(t, error))); }
          }} /></View>
        {hasAnalytics && <View style={ui.row}><Text style={ui.heading}>{t.usage}</Text><Switch accessibilityLabel={t.usage}
          value={usage} onValueChange={setUsage} /></View>}
        <Text style={ui.heading}>{t.privacy}</Text><Text style={ui.small}>{t.privacyBody}</Text>
        <Button muted disabled={pending} onPress={() => void signOut()}>{t.signOut}</Button>
        <Button muted disabled={pending} onPress={requestDeletion}>{t.deleteAccount}</Button>
      </View>}
    </ScrollView>
    {profile && <View style={ui.nav}>
      {(['rooms', 'room', 'shop', 'profile'] as const).map(tab =>
        <Pressable key={tab} accessibilityRole="tab" disabled={running} onPress={() => setPage(tab)}
          accessibilityState={{ selected: tab === effectivePage, disabled: running }} style={[ui.navTab, tab === effectivePage && ui.navActive, running && { opacity: .46 }]}>
          <Text style={[ui.navText, tab === effectivePage && ui.accent]}>{t[tab]}</Text>
        </Pressable>)}
    </View>}
    {rankingOpen && !running && !verify && <LeaderboardModal user={id} t={t} close={() => setRankingOpen(false)}
      pending={pending} changeVisibility={visible => act({ name: 'rankingVisibility', payload: { visible } })} />}
    {cardOpen && profile && !running && !verify && <StudyCardModal user={id} profile={profile}
      equipment={equipped} close={() => setCardOpen(false)} t={t} />}
    <Modal visible={Boolean(peer?.desk_ref && !running && !verify)} transparent onRequestClose={() => setPeer(undefined)} accessibilityViewIsModal>
      <View style={ui.modal}><View style={ui.card}>
        <Text style={ui.heading}>{peer?.name}</Text>
        {(['coffee', 'clap'] as const).map(kind => <Button key={kind} disabled={pending} onPress={() => {
          if (peer?.desk_ref) act({ name: 'react', payload: { desk: peer.desk_ref, kind } });
        }}>{kind === 'coffee' ? t.coffeeReaction : t.clapReaction}</Button>)}
        {actionError !== '' && <Text style={ui.warning}>{actionError}</Text>}
        <Button muted onPress={() => setPeer(undefined)}>{t.done}</Button>
      </View></View>
    </Modal>
    <Modal visible={prize !== null && !verify} transparent onRequestClose={() => setPrize(null)} accessibilityViewIsModal>
      <View style={ui.modal}><View style={ui.card}>
        <Text style={ui.heading}>✨ {t.prize}</Text>
        {prizeItem && <ItemIllustration item={prizeItem} />}
        {prize && <Text style={ui.accent}>{'item' in prize
          ? label(prizeItem ?? { name: prize.item, name_en: prize.item })
          : `${prize.coins} ${t.coins}`}</Text>}
        <Button onPress={() => setPrize(null)}>{t.done}</Button>
      </View></View>
    </Modal>
    <Modal visible={verify} transparent onRequestClose={() => {}} accessibilityViewIsModal>
      <View style={ui.modal}><View style={ui.card}>
        <Text style={ui.heading}>{t.verify}</Text>
        <Text style={ui.timer}>{Math.ceil(remainingCheck / 1000)}</Text>
        <Button disabled={pending} onPress={() => act({ name: 'verify' })}>{t.here}</Button>
        {running && <Button muted disabled={pending} onPress={() => act({ name: 'status', payload: { status: 'break' } })}>{t.pause}</Button>}
        {actionError !== '' && <Text style={ui.warning}>{actionError}</Text>}
      </View></View>
    </Modal>
  </>;
}
