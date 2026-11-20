import type { RealtimeChannel } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { hairStyles } from '../../public/avatar-art';
import { deleteAccount, library, supabase } from './api';
import type { Avatar, Command, Drop, Focus, Item, Profile, Snapshot } from './model';
import { RoomScene, Sprite } from './scene';
import { allowReminders, syncRemoteReminders, removeRemoteReminders, useReminder } from './reminders';
import { hasAnalytics, setUsageMeasurement, trackUsage } from './telemetry';
import { message, usePreferences, words, type Locale, type Translation } from './strings';
import { Button, Field, Options, ui } from './ui';
import { Boxes, Directory, Invite, RoomGoal, TargetEditor } from './clubs';
import { Ambience } from './ambience';

type Action = { [K in keyof Command]: { name: K; payload?: Command[K] } }[keyof Command];

const baseAvatar: Avatar = { gender: 'unspecified', hair: 0, outfit: 0, color: '#bd7050' };
const minute = 60000;
const interval = 20 * minute;

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

function Items({ snapshot, inventory, t, locale, pending, onAction }: {
  snapshot: Snapshot; inventory: boolean; t: Translation; locale: Locale;
  pending: boolean; onAction: (action: Action) => void;
}) {
  const owned = new Map(snapshot.inventory.map(entry => [entry.item, entry.placed]));
  const icons: Record<Item['id'], string> = { lamp: '🏮', plant: '🪴', cat: '🐈', sweater: '🧥', goldKeys: '⌨️', dragon: '🐉', neon: '💡', space: '🪐', forest: '🌲' };
  const visible = inventory ? snapshot.items.filter(item => owned.has(item.id)) : snapshot.items.filter(item => item.kind !== 'rare');
  return <>
    {inventory && <Text style={ui.heading}>{t.inventory}</Text>}
    {visible.length === 0 && <Text style={ui.small}>{t.emptyInventory}</Text>}
    {visible.map(item => <View style={[ui.card, ui.row]} key={item.id}>
      <Text style={ui.heading}>{icons[item.id]} {locale === 'tr' ? item.name : item.name_en}</Text>
      {inventory && item.id === 'cat' && <View style={{ flexShrink: 1 }}>
        <Text style={ui.small}>{t.petName} {1 + (snapshot.pet?.xp ?? 0)}</Text>
        <Text style={ui.small}>{snapshot.pet?.upset ? t.petUpset : t.petHappy}</Text>
      </View>}
      <Button muted={inventory} disabled={pending || (inventory ? item.kind === 'ambience' : owned.has(item.id))}
        onPress={() => onAction({ name: inventory ? 'place' : 'buy', payload: { item: item.id } })}>
        {inventory ? item.kind === 'ambience' ? t.owned : owned.get(item.id) ? t.remove : t.use : owned.has(item.id) ? t.owned : `${item.price} ${t.coins}`}
      </Button>
    </View>)}
  </>;
}

export function Library({ id }: { id: string }) {
  const { locale, setLocale, page, setPage, alerts, setAlerts, usage, setUsage } = usePreferences();
  const t = words[locale];
  const [prize, setPrize] = useState<Drop | null>(null);
  const [editing, setEditing] = useState(false);
  const [moment, setMoment] = useState(Date.now);
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
  const offset = snapshot ? snapshot.now - query.dataUpdatedAt : 0;
  const localRoom = snapshot?.profile?.room;
  const focus = snapshot?.session?.state === 'active' ? snapshot.session : null;
  const running = focus?.paused_at === null;
  const effectivePage = running || (page === 'room' && localRoom) ? 'room' : page === 'room' ? 'rooms' : page;
  const due = focus?.verification_due ?? (running ? focus.start + (focus.checks + 1) * interval : null);
  const next = due !== null && focus && due < focus.end ? due : null;
  const observed = moment + offset;
  const verify = next !== null && observed >= next && observed < next + 30000;
  useReminder(alerts, next, offset, t);
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
      setMoment(Date.now());
      if (action.name === 'profile') setEditing(false);
      if (['join', 'joinCode', 'createRoom'].includes(action.name)) { setPage('room'); trackUsage('room_joined'); }
      if (action.name === 'start') trackUsage('focus_started');
      if (action.name === 'verify') trackUsage('focus_confirmed');
      if (action.name === 'leave') setPage('rooms');
      if (data.drop) setPrize(data.drop);
      if (action.name === 'status' || action.name === 'start' || action.name === 'place' || action.name === 'target' || action.name === 'abandon') {
        void presence.current?.track({ changed: data.now });
      }
    },
    onError: error => setActionError(message(t, error)),
  });

  const pendingPause = mutation.isPending && mutation.variables?.name === 'status' && mutation.variables.payload?.status === 'break';
  const timerNow = pendingPause ? mutation.submittedAt + offset : observed;

  useEffect(() => {
    if (!focus) return;
    const timer = setInterval(() => setMoment(Date.now()), 200);
    setMoment(Date.now());
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

  async function signOut() {
    await removeRemoteReminders().catch(() => {});
    setAlerts(false);
    setUsage(false);
    setUsageMeasurement(false);
    await supabase!.auth.signOut({ scope: 'local' });
    queryClient.removeQueries({ queryKey: key });
    setPage('rooms');
  }

  function requestDeletion() {
    Alert.alert(t.deleteAccount, t.confirmDelete, [
      { text: t.cancel, style: 'cancel' },
      { text: t.deleteAccount, style: 'destructive', onPress: () => {
        setDeleting(true);
        void deleteAccount().then(signOut).catch(error => setActionError(message(t, error)))
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
  const label = (item: { name: string; name_en: string }) => locale === 'tr' ? item.name : item.name_en;
  const pending = mutation.isPending || deleting;
  function act(action: Action) {
    if (pending) return;
    mutation.mutate(action);
  }

  return <>
    <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <View style={ui.row}>
        <Text style={[ui.title, { flexShrink: 1 }]}>{t.app}</Text>
        {profile && <Text style={ui.accent}>{profile.coins} {t.coins}</Text>}
      </View>
      {actionError !== '' && <Text accessibilityLiveRegion="polite" style={ui.warning}>{actionError}</Text>}
      {!profile ? <AvatarEditor profile={null} onSave={payload => act({ name: 'profile', payload })} pending={pending} t={t} locale={locale} /> :
        effectivePage === 'rooms' ? <Directory rooms={snapshot.rooms} current={profile.room} pending={pending}
          coins={profile.coins} locale={locale} t={t}
          join={room => room === localRoom ? setPage('room') : act({ name: 'join', payload: { room } })}
          enter={code => act({ name: 'joinCode', payload: { code } })}
          create={name => act({ name: 'createRoom', payload: { name } })} /> : effectivePage === 'room' ? <>
          {room && <View style={ui.row}>
            <Text style={ui.heading}>{label(room)}</Text><Text style={ui.small}>{room.count}/{room.capacity}</Text>
          </View>}
          <RoomScene room={localRoom ?? null} members={snapshot.members} aurora={(room?.minutes ?? 0) >= 500} t={t} />
          {room && <RoomGoal minutes={room.minutes ?? 0} t={t} />}
          {room && !running && <Invite room={room} t={t} />}
          {snapshot.session?.state === 'completed' && <Text style={ui.accent}>{t.reward}</Text>}
          {snapshot.session?.state === 'invalid' && <Text style={ui.warning}>{t.invalid}</Text>}
          <Period focus={focus} remaining={focus ? focus.end - (focus.paused_at ?? timerNow) : 0}
            t={t} pending={pending} canStart={Boolean(room)} onAction={act} />
          {!focus && room && <View style={ui.card}>
            <Options label={label(room)} values={([['desk', t.desk], ['break', t.break]] as const)}
              value={profile.status ?? 'desk'} onChange={status => act({ name: 'status', payload: { status } })} />
            <Button muted disabled={pending} onPress={() => act({ name: 'leave' })}>{t.leave}</Button>
          </View>}
          {room && <Ambience locked={running} inventory={snapshot.inventory} t={t} />}
        </> : effectivePage === 'shop' ?
          <>
            <Boxes snapshot={snapshot} pending={pending} t={t} open={name => act({ name })} />
            <Items snapshot={snapshot} inventory={false} t={t} locale={locale} pending={pending} onAction={act} />
          </> :
          <>
            {editing ? <AvatarEditor profile={profile} onSave={payload => act({ name: 'profile', payload })} pending={pending} t={t} locale={locale} /> :
              <View style={ui.card}>
                <View style={ui.row}><Sprite avatar={profile.avatar} width={74} /><View style={{ flex: 1 }}>
                  <Text style={ui.heading}>{profile.name}</Text>
                  {!!profile.target && <Text numberOfLines={1} style={ui.small}>{profile.target}</Text>}
                </View></View>
                <Button disabled={pending} onPress={() => setEditing(true)}>{t.editAvatar}</Button>
              </View>}
            <TargetEditor initial={profile.target ?? ''} pending={pending} t={t} save={target => act({ name: 'target', payload: { target } })} />
            <Items snapshot={snapshot} inventory t={t} locale={locale} pending={pending} onAction={act} />
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
          accessibilityState={{ selected: tab === effectivePage, disabled: running }} style={[ui.navTab, running && { opacity: .46 }]}>
          <Text style={[ui.navText, tab === effectivePage && ui.accent]}>{t[tab]}</Text>
        </Pressable>)}
    </View>}
    <Modal visible={prize !== null && !verify} transparent onRequestClose={() => setPrize(null)} accessibilityViewIsModal>
      <View style={ui.modal}><View style={ui.card}>
        <Text style={ui.heading}>✨ {t.prize}</Text>
        {prize && <Text style={ui.accent}>{'item' in prize
          ? label(snapshot.items.find(item => item.id === prize.item) ?? { name: prize.item, name_en: prize.item })
          : `${prize.coins} ${t.coins}`}</Text>}
        <Button onPress={() => setPrize(null)}>{t.done}</Button>
      </View></View>
    </Modal>
    <Modal visible={verify} transparent onRequestClose={() => {}} accessibilityViewIsModal>
      <View style={ui.modal}><View style={ui.card}>
        <Text style={ui.heading}>{t.verify}</Text>
        <Text style={ui.timer}>{Math.max(0, Math.ceil(((next ?? 0) + 30000 - observed) / 1000))}</Text>
        <Button disabled={pending} onPress={() => act({ name: 'verify' })}>{t.here}</Button>
        {running && <Button muted disabled={pending} onPress={() => act({ name: 'status', payload: { status: 'break' } })}>{t.pause}</Button>}
        {actionError !== '' && <Text style={ui.warning}>{actionError}</Text>}
      </View></View>
    </Modal>
  </>;
}
