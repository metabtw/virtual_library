import type { RealtimeChannel } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Image, ImageBackground, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text,
  useWindowDimensions, View } from 'react-native';
import { avatarOptions, avatarPresets, defaultAvatar, hairStyles, pickAvatarStyle } from '../../public/avatar-art';
import { focusRemaining, markServerTime, serverTimeAt, verificationRemaining } from '../../public/focus-clock';
import { displayDeskStatuses, recordDeskStatus, type DeskUpdates } from '../../public/desk-status';
import { breakPresets, roomProgressMinutes, roomThemeUnlockMinutes } from '../../public/study-rewards';
import { library, notifyRoomPresence, roomConnection, supabase } from './api';
import type { Avatar, BoxTier, Command, Drop, Focus, ItemId, Profile, Snapshot } from './model';
import { RoomScene, Sprite } from './scene';
import { allowReminders, hasExactReminderSettings, openExactReminderSettings, syncRemoteReminders,
  removeRemoteReminders, useReminder } from './reminders';
import { hasAnalytics, setUsageMeasurement, trackUsage } from './telemetry';
import { message, usePreferences, words, type Locale, type Translation } from './strings';
import { Button, Field, Options, ui } from './ui';
import { Directory, Invite, PrivateBadge, RoomGoal, TargetEditor } from './clubs';
import { Ambience } from './ambience';
import { Catalog } from './catalog';
import { CoinNotice } from './coin-notice';
import { ChestReward } from './chest-reward';
import { dressedAvatar } from './cosmetics';
import { roomThemes, ThemePicker } from './themes';
import { LeaderboardModal, StudyCardModal } from './study';
import { presetAssets } from './asset-art';
import { TermsButton } from './auth';
import { AccountSheet, type AccountPanel } from './account-sheets';
import { LoadingScreen, TourSheet } from './arrival';
import { Games } from './games';
import { ShopRewards } from './ads';
import { FocusQuests, FriendInviteButton, FriendsPanel, ProfileCodeField, ProfileCodes, StudyInvitations } from './community';
import type { ProfileCodePrefix } from '../../public/room-social';

type Action = { [K in keyof Command]: { name: K; payload?: Command[K] } }[keyof Command];

const styleFields = ['hair', 'hair_color', 'skin_tone', 'beard', 'outfit'] as const;
const minute = 60000;
function formatTime(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(seconds / 60), seconds % 60].map(part => String(part).padStart(2, '0')).join(':');
}

function AvatarEditor({ profile, onSave, pending, t, locale }: {
  profile: Profile | null; onSave: (data: Command['profile']) => void;
  pending: boolean; t: Translation; locale: Locale;
}) {
  const [name, setName] = useState(profile?.name ?? '');
  const [referral, setReferral] = useState('');
  const [prefix, setPrefix] = useState<ProfileCodePrefix>('DV');
  const [avatar, setAvatar] = useState<Avatar>(() => ({ ...defaultAvatar, ...profile?.avatar }));
  const [openStyle, setOpenStyle] = useState<typeof styleFields[number]>();
  const options = { hair: hairStyles[avatar.gender], ...avatarOptions };
  const labels = { hair: t.hair, hair_color: t.hairColor, skin_tone: t.skinTone, beard: t.beard, outfit: t.outfit };
  const values = { hair: avatar.hair_style ?? avatar.hair, hair_color: avatar.hair_color ?? 0,
    skin_tone: avatar.skin_tone ?? 0, beard: avatar.beard ?? 0, outfit: avatar.outfit_style ?? avatar.outfit };
  return <View style={ui.card}>
    <Text style={ui.heading}>{profile ? t.editAvatar : t.newAvatar}</Text>
    <View style={{ alignSelf: 'center' }}><Sprite avatar={avatar} width={90} /></View>
    <Field label={t.name} value={name} onChangeText={setName} maxLength={24} />
    {!profile && <ProfileCodeField label={t.referralField} value={referral} prefix={prefix}
      onChange={setReferral} onPrefixChange={setPrefix} t={t} />}
    <View style={ui.field}>
      <Text style={ui.small}>{t.characterPresets}</Text>
      <View style={ui.options}>
        {avatarPresets.map(preset => <Pressable key={preset.id} accessibilityRole="button" accessibilityLabel={preset[locale]}
          style={[ui.chip, avatarEditorStyles.preset]} onPress={() => {
            setAvatar({ ...defaultAvatar, ...preset.look });
            setOpenStyle(undefined);
          }}>
          <Image source={presetAssets[preset.id]} resizeMode="contain" accessible={false} style={avatarEditorStyles.preview} />
          <Text style={[ui.ink, avatarEditorStyles.name]}>{preset[locale]}</Text>
        </Pressable>)}
      </View>
    </View>
    <Options label={t.gender} value={avatar.gender}
      values={(['unspecified', 'female', 'male'] as const).map(value => [value, t[value]])}
      onChange={gender => setAvatar({ ...avatar, gender })} />
    {styleFields.map(field => {
      const expanded = openStyle === field;
      const label = labels[field];
      const choices = options[field][locale];
      const selected = values[field];
      return <View key={field} style={ui.field}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} · ${choices[selected]}`} accessibilityState={{ expanded }}
          onPress={() => setOpenStyle(expanded ? undefined : field)} style={[ui.chip, ui.row, expanded && ui.selected]}>
          <Text style={[ui.small, avatarEditorStyles.option]}>{label}</Text>
          <Text style={[ui.ink, avatarEditorStyles.option]}>{choices[selected]} {expanded ? '⌃' : '⌄'}</Text>
        </Pressable>
        {expanded && <Options value={selected} values={choices.map((text, index) => [index, text])}
          onChange={value => {
            setAvatar(current => field === 'hair' || field === 'outfit'
              ? pickAvatarStyle(current, field, value) : { ...current, [field]: value });
            setOpenStyle(undefined);
          }} />}
      </View>;
    })}
    <Options label={t.color} value={avatar.color}
      values={[['#bd7050', t.cinnamon], ['#789078', t.sage], ['#7988ab', t.midnight], ['#ad7963', t.coffee]]}
      onChange={color => setAvatar({ ...avatar, color })} />
    <Button disabled={pending || name.trim().length < 2}
      onPress={() => onSave({ ...avatar, name, referral: referral ? `${prefix}-${referral}` : undefined })}>{t.save}</Button>
  </View>;
}

const avatarEditorStyles = StyleSheet.create({
  preset: { minWidth: 72, flexBasis: '29%', flexGrow: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 4 },
  preview: { width: 35, height: 68 },
  name: { textAlign: 'center', fontSize: 12 },
  option: { flexShrink: 1 },
});

function ProfileOverview({ profile, accountId, equipment, pending, t, onEdit, onLeave }: {
  profile: Profile; accountId: string; equipment: ItemId[]; pending: boolean;
  t: Translation; onEdit: () => void; onLeave: () => void;
}) {
  const { width } = useWindowDimensions();
  const avatarWidth = Math.round(Math.min(113, Math.max(57, width * 0.18)));
  return <ImageBackground source={roomThemes.classic.image} style={profileStyles.hero} resizeMode="cover">
    <View style={profileStyles.heroContent}>
      <Sprite avatar={dressedAvatar(profile.avatar, equipment)} width={avatarWidth} pose="standing" />
      <View style={profileStyles.details}>
        <Text style={ui.heading}>{profile.name}</Text>
        {!!profile.target && <Text numberOfLines={2} style={ui.small}>{profile.target}</Text>}
        <ProfileCodes profile={profile} accountId={accountId} t={t} />
        <View style={profileStyles.heroActions}>
          <View style={profileStyles.heroAction}><Button compact muted disabled={pending} onPress={onEdit}>{t.editAvatar}</Button></View>
          {profile.room && <View style={profileStyles.heroAction}><Button compact muted disabled={pending} onPress={onLeave}>{t.leave}</Button></View>}
        </View>
      </View>
    </View>
  </ImageBackground>;
}

const profileStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: '#fff0dc', fontSize: 24, fontWeight: '700', fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }) },
  shortcuts: { flex: 1.55, flexDirection: 'row', gap: 5 },
  shortcut: { flex: 1, justifyContent: 'center', minWidth: 0 },
  hero: { borderRadius: 19, borderWidth: 1, borderColor: '#986c5e', overflow: 'hidden', backgroundColor: '#352331' },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, backgroundColor: '#211526b8' },
  details: { flex: 1, minWidth: 0, gap: 8 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  heroAction: { flexGrow: 1 },
});

function Period({ focus, remaining, breakRemaining, pending, onAction, t, canStart }: {
  focus: Focus | null; remaining: number; breakRemaining: number; pending: boolean; onAction: (action: Action) => void;
  t: Translation; canStart: boolean;
}) {
  const { duration, durationChoice, customBreak, setDuration, setDurationChoice, setCustomBreak } = usePreferences();
  const choice = durationChoice ?? (Object.hasOwn(breakPresets, duration) ? duration : 'custom');
  const custom = choice === 'custom';
  const value = Number(custom ? duration : choice);
  const breakMinutes = custom ? Number(customBreak) : breakPresets[choice];
  const valid = Number.isInteger(value) && value >= 5 && value <= 180
    && Number.isInteger(breakMinutes) && breakMinutes >= 1 && breakMinutes <= 60;
  const time = formatTime(breakRemaining || (focus ? remaining : valid ? value * minute : 0));
  const presets = Object.entries(breakPresets).map(([value, length]): [string, string] =>
    [value, value + ' ' + t.focusAndBreak.replace('{break}', String(length))]);
  const paused = focus?.paused_at != null;
  return <View style={ui.card}>
    <View style={ui.row}>
      <Text style={ui.heading}>{breakRemaining > 0 ? t.autoBreak : t.focus}</Text>
      <Text style={ui.timer}>{time}</Text>
    </View>
    {breakRemaining > 0 ? <Text style={ui.small}>{t.breakInProgress}</Text> : focus ? <Button disabled={pending || (paused && !canStart)} onPress={() =>
      onAction({ name: 'status', payload: { status: paused ? 'desk' : 'break' } })}>
      {paused ? t.resume : t.pause}
    </Button> : <>
      <Options label={t.focus} value={choice} values={[...presets, ['custom', t.customDuration]]} onChange={setDurationChoice} />
      {custom && <>
        <Field label={t.duration} keyboardType="number-pad" value={duration} onChangeText={setDuration} maxLength={3} />
        <Field label={t.breakDuration + ' · ' + t.breakDurationHelp} keyboardType="number-pad" value={customBreak} onChangeText={setCustomBreak} maxLength={2} />
      </>}
      <Button disabled={pending || !valid || !canStart} onPress={() => onAction({ name: 'start', payload: { duration: value, breakMinutes } })}>
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
  useEffect(() => { setPage('rooms'); }, [id, setPage]);
  const [prize, setPrize] = useState<{ drop: Drop; tier: BoxTier } | null>(null);
  const [editing, setEditing] = useState(false);
  const [moment, setMoment] = useState(() => performance.now());
  const [foreground, setForeground] = useState((AppState.currentState ?? 'active') === 'active');
  const [refreshAfter, setRefreshAfter] = useState(0);
  const lastServerTime = useRef(0);
  const returnedBreak = useRef<string | undefined>(undefined);
  const lostConnection = useRef(false);
  const [connectionExpired, setConnectionExpired] = useState(false);
  const [pendingPauseAt, setPendingPauseAt] = useState<number>();
  const [peer, setPeer] = useState<string>();
  const [rankingOpen, setRankingOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [accountPanel, setAccountPanel] = useState<AccountPanel | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reactionMessage, setReactionMessage] = useState('');
  const incomingReaction = useRef(false);
  const reactionTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seenReactions = useRef(new Set<string>());
  const [actionError, setActionError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [reminderRevision, setReminderRevision] = useState(0);
  const [presenceReadyRoom, setPresenceReadyRoom] = useState<string | null>(null);
  const [deskUpdates, setDeskUpdates] = useState<DeskUpdates>(() => new Map());
  const presence = useRef<RealtimeChannel | null>(null);
  const queryClient = useQueryClient();
  const key = ['library', id] as const;
  const query = useQuery({
    queryKey: key, queryFn: () => library('state'),
    retry: (count, error) => error.message !== 'networkUnavailable' && count < 2,
    refetchInterval: query => {
      const room = query.state.data?.profile?.room;
      return room && room !== presenceReadyRoom ? 1000 : 5000;
    },
  });
  const snapshot = query.data;
  const roomMembers = useMemo(() => displayDeskStatuses(snapshot?.members ?? [], snapshot?.now ?? 0, deskUpdates),
    [snapshot?.members, snapshot?.now, deskUpdates]);
  const selectedPeer = roomMembers.find(member => peer && member.desk_ref === peer && !member.own);
  const inventory = snapshot?.inventory;
  const equipped = useMemo(() => inventory?.filter(item => item.placed).map(item => item.item) ?? [], [inventory]);
  const serverSample = snapshot?.now;
  const clock = useMemo(() => serverSample === undefined ? undefined : markServerTime(serverSample, query.dataUpdatedAt),
    [serverSample, query.dataUpdatedAt]);
  useEffect(() => { lastServerTime.current = serverSample ?? 0; }, [serverSample]);
  const observed = clock ? serverTimeAt(clock, moment) : 0;
  const networkOffline = query.error?.message === 'networkUnavailable';
  const disconnectDeadline = snapshot?.session?.disconnectDeadline;
  const expiredLocally = networkOffline && disconnectDeadline != null && observed >= disconnectDeadline;
  const localRoom = expiredLocally ? null : snapshot?.profile?.room;
  const focus = !expiredLocally && snapshot?.session?.state === 'active' ? snapshot.session : null;
  const running = focus?.paused_at === null;
  const autoBreak = snapshot?.autoBreak;
  const breakRemaining = Math.max(0, (autoBreak?.endsAt ?? 0) - observed);
  const effectivePage = running || (page === 'rooms' && localRoom && !breakRemaining) ? 'room'
    : page === 'room' && !localRoom ? 'rooms' : page;
  const remainingCheck = foreground && !networkOffline && (serverSample ?? 0) > refreshAfter ? verificationRemaining(focus, observed) : 0;
  useEffect(() => {
    if (networkOffline) {
      if (disconnectDeadline != null) lostConnection.current = true;
      if (expiredLocally) setPage('rooms');
    } else if (lostConnection.current) {
      lostConnection.current = false;
      if (!localRoom) { setConnectionExpired(true); setPage('rooms'); }
    }
    if (localRoom && !networkOffline) setConnectionExpired(false);
  }, [networkOffline, disconnectDeadline, expiredLocally, localRoom, setPage]);
  useEffect(() => {
    if (!autoBreak || breakRemaining || !localRoom || returnedBreak.current === autoBreak.id) return;
    returnedBreak.current = autoBreak.id;
    setRankingOpen(false);
    setCardOpen(false);
    setInviteOpen(false);
    setPeer(undefined);
    setPage('room');
    void queryClient.invalidateQueries({ queryKey: ['library', id] }, { cancelRefetch: false });
  }, [autoBreak, breakRemaining, localRoom, setPage, queryClient, id]);
  const verify = remainingCheck > 0;
  useReminder(alerts, focus?.next_check_at ?? null, clock, t, reminderRevision);
  useEffect(() => {
    if (localRoom && AppState.currentState === 'background') void notifyRoomPresence(localRoom, 'background');
    const subscription = AppState.addEventListener('change', status => {
      setForeground(status === 'active');
      if (status === 'background' && localRoom) {
        roomConnection.advance();
        void notifyRoomPresence(localRoom, 'background');
      }
      if (status === 'active') {
        roomConnection.advance();
        setRefreshAfter(lastServerTime.current);
        setMoment(performance.now());
        void queryClient.invalidateQueries({ queryKey: ['library', id] }, { cancelRefetch: false });
      }
    });
    return () => subscription.remove();
  }, [id, localRoom, queryClient]);
  useEffect(() => {
    if (!localRoom) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      roomConnection.advance();
      void Promise.race([
        notifyRoomPresence(localRoom, 'disconnect'),
        new Promise(resolve => setTimeout(resolve, 600)),
      ]).then(() => BackHandler.exitApp());
      return true;
    });
    return () => subscription.remove();
  }, [localRoom]);
  useEffect(() => {
    if (snapshot?.profile?.doNotDisturb) {
      if (incomingReaction.current) {
        incomingReaction.current = false;
        clearTimeout(reactionTimeout.current);
        setReactionMessage('');
      }
      return;
    }
    const incoming = (snapshot?.reactions ?? []).filter(event => !seenReactions.current.has(event.id));
    if (!incoming.length) return;
    for (const event of incoming) seenReactions.current.add(event.id);
    if (seenReactions.current.size > 128) {
      for (const key of [...seenReactions.current].slice(0, 64)) seenReactions.current.delete(key);
    }
    incomingReaction.current = true;
    setReactionMessage(incoming.map(event =>
      `${event.kind === 'coffee' ? '☕' : '👏'} ${event.name} ${event.kind === 'coffee' ? t.coffeeReceived : t.clapReceived}`).join(' · '));
    clearTimeout(reactionTimeout.current);
    reactionTimeout.current = setTimeout(() => setReactionMessage(''), 5000);
  }, [snapshot?.reactions, snapshot?.profile?.doNotDisturb, t]);
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
      const newlyVisible = snapshot?.profile?.doNotDisturb && !data.profile?.doNotDisturb
        ? data.friends?.filter(friend => friend.status === 'incoming').length : 0;
      queryClient.setQueryData(key, data);
      setMoment(performance.now());
      if (action.name === 'profile') {
        setEditing(false);
        if (data.profile?.tourPending) setPage('rooms');
      }
      if (['join', 'joinCode', 'createRoom'].includes(action.name)) { setPage('room'); trackUsage('room_joined'); }
      if (action.name === 'answerStudyInvite' && data.joinedInvite) { setPage('room'); trackUsage('room_joined'); }
      if (action.name === 'start') trackUsage('focus_started');
      if (action.name === 'verify') trackUsage('focus_confirmed');
      if (action.name === 'leave') { setInviteOpen(false); setPage('rooms'); }
      if (data.drop) setPrize({ drop: data.drop, tier: data.drop.tier ?? (action.name === 'openBox' ? action.payload?.tier : 'basic') ?? 'basic' });
      if (newlyVisible) {
        incomingReaction.current = true;
        setReactionMessage(t.newFriendCount.replace('{amount}', String(newlyVisible)));
        clearTimeout(reactionTimeout.current);
        reactionTimeout.current = setTimeout(() => setReactionMessage(''), 5000);
      }
      if (action.name === 'react' || action.name === 'addDeskFriend') {
        setPeer(undefined);
        incomingReaction.current = false;
        setReactionMessage(action.name === 'react' ? t.reactionSent : t.friendSent);
        clearTimeout(reactionTimeout.current);
        reactionTimeout.current = setTimeout(() => setReactionMessage(''), 5000);
      }
      if (action.name === 'inviteFriend' || (action.name === 'leave' && data.privateRoomClosing)) {
        incomingReaction.current = false;
        setReactionMessage(action.name === 'leave' ? t.privateRoomClosing : t.studyInviteSent);
        clearTimeout(reactionTimeout.current);
        reactionTimeout.current = setTimeout(() => setReactionMessage(''), 5000);
      }
      if (action.name === 'rankingVisibility') void queryClient.invalidateQueries({ queryKey: ['leaderboard', id] });
      if (['place', 'target', 'profile', 'react', 'addDeskFriend', 'setDoNotDisturb'].includes(action.name)) {
        const channel = presence.current;
        void channel?.track({ changed: data.now }).then(result => {
          if (presence.current === channel) {
            setPresenceReadyRoom(result === 'ok' && channel.state === 'joined' ? localRoom ?? null : null);
          }
        });
      }
    },
    onError: error => setActionError(message(t, error)),
    onSettled: () => setPendingPauseAt(undefined),
  });

  const inviteClock = snapshot?.studyInvites?.some(invite => (invite.expiresAt ?? 0) > observed)
    || snapshot?.friends?.some(friend => (friend.inviteRetryAt ?? 0) > observed);
  const clockInterval = focus || breakRemaining > 0 ? 200 : snapshot?.roomGoal?.live.length || inviteClock || (effectivePage === 'shop' && (snapshot?.adRetryAt ?? 0) > observed) ? 1000 : 0;
  useEffect(() => {
    if (!clockInterval) return;
    const timer = setInterval(() => setMoment(performance.now()), clockInterval);
    setMoment(performance.now());
    return () => clearInterval(timer);
  }, [clockInterval]);
  useEffect(() => {
    setPresenceReadyRoom(null);
    setDeskUpdates(new Map());
    if (!localRoom) return;
    const client = supabase!;
    const channel = client.channel(`room:${localRoom}`, { config: { private: true, presence: { key: id } } });
    presence.current = channel;
    channel.on('presence', { event: 'sync' }, () => {
      void queryClient.invalidateQueries({ queryKey: ['library', id] });
    }).on('broadcast', { event: 'room_membership' }, () => {
      void queryClient.invalidateQueries({ queryKey: ['library', id] }, { cancelRefetch: false });
    }).on('broadcast', { event: 'desk_activity' }, ({ payload }) => {
      if (presence.current !== channel) return;
      setDeskUpdates(previous => recordDeskStatus(previous, payload));
      const current = queryClient.getQueryData<Snapshot>(['library', id]);
      if (current?.members.some(member => member.own && member.desk_ref === payload?.desk
        && (member.activity ?? member.status) !== payload?.status)) {
        void queryClient.invalidateQueries({ queryKey: ['library', id] });
      }
    }).subscribe(status => {
      if (presence.current !== channel) return;
      setPresenceReadyRoom(null);
      if (status === 'SUBSCRIBED') void channel.track({ changed: Date.now() }).then(result => {
        if (presence.current === channel && result === 'ok' && channel.state === 'joined') setPresenceReadyRoom(localRoom);
      });
    });
    return () => { presence.current = null; void client.removeChannel(channel); };
  }, [id, localRoom, queryClient]);

  async function signOut(accountDeleted = false) {
    if (!accountDeleted && localRoom) await notifyRoomPresence(localRoom, 'disconnect');
    await removeRemoteReminders(accountDeleted).catch(() => {});
    setAlerts(false);
    setUsage(false);
    setUsageMeasurement(false);
    const { error } = await supabase!.auth.signOut({ scope: 'local' });
    if (error && !accountDeleted) throw error;
    queryClient.removeQueries({ queryKey: key });
    queryClient.removeQueries({ queryKey: ['studySummary', id] });
    queryClient.removeQueries({ queryKey: ['leaderboard', id] });
    setPage('rooms');
  }

  if (!snapshot && !query.isError) return <LoadingScreen label={t.loading} />;
  if (!snapshot) return <View style={ui.content}>
    <Text style={ui.title}>{t.app}</Text>
    <Text style={ui.warning}>{message(t, query.error)}</Text>
    <Button onPress={() => void query.refetch()}>{t.retry}</Button>
  </View>;

  const profile = snapshot.profile;
  const room = snapshot.rooms.find(room => room.id === localRoom);
  const aurora = (room?.minutes ?? 0) >= roomThemeUnlockMinutes;
  const friends = snapshot.friends ?? [];
  const accepted = friends.filter(friend => friend.status === 'accepted');
  const unread = profile?.doNotDisturb ? 0 : friends.filter(friend => friend.status === 'incoming').length + (snapshot.studyInvites?.length ?? 0);
  const prizeId = prize && 'item' in prize.drop ? prize.drop.item : undefined;
  const prizeItem = snapshot.items.find(item => item.id === prizeId);
  const label = (item: { name: string; name_en: string }) => locale === 'tr' ? item.name : item.name_en;
  const pending = mutation.isPending || signingOut || networkOffline;
  function act(action: Action) {
    if (pending) return;
    if (running && action.name === 'status' && action.payload?.status === 'break') setPendingPauseAt(observed);
    mutation.mutate(action);
  }
  const leaveCopy = room?.owned && room.count <= 1 ? t.leaveConfirm + '\n\n' + t.privateRoomClosing : t.leaveConfirm;
  function requestLeave() {
    if (localRoom && !pending && !running) setAccountPanel('leave');
  }
  function confirmAccount(action: 'leave' | 'signOut') {
    setAccountPanel(null);
    if (action === 'leave') act({ name: 'leave' });
    else {
      setSigningOut(true);
      void signOut().catch(error => setActionError(message(t, error))).finally(() => setSigningOut(false));
    }
  }
  const quietToggle = <View style={[ui.card, ui.row]}>
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={ui.heading}>{t.quietMode}</Text>
      <Text style={ui.small}>{t.quietModeHelp}</Text>
    </View>
    <Switch value={!!profile?.doNotDisturb} accessibilityLabel={t.quietMode} disabled={pending}
      onValueChange={enabled => act({ name: 'setDoNotDisturb', payload: { enabled } })} />
  </View>;
  const invitations = <StudyInvitations invites={snapshot.studyInvites} locale={locale} pending={pending} now={observed} t={t}
    answer={(id, answer) => act({ name: 'answerStudyInvite', payload: { id, answer } })} />;

  return <>
      {(connectionExpired || expiredLocally || (networkOffline && localRoom)) && <Text style={[ui.card, ui.warning, { margin: 8 }]} accessibilityLiveRegion="polite">
        {connectionExpired || expiredLocally ? t.connectionExpired : disconnectDeadline == null ? t.reconnecting
          : t.networkUnavailable + ' ' + t.reconnectIn + ' · ' + formatTime(disconnectDeadline - observed)}
      </Text>}
    {reactionMessage !== '' && <Text accessibilityLiveRegion="polite" style={[ui.card, ui.accent, { margin: 8 }]}>
      {reactionMessage}
    </Text>}
    <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <View style={ui.row}>
        <View style={[ui.row, { flexShrink: 1 }]}>
          <Image source={require('../../public/app-logo.png')} style={{ width: 32, height: 32 }} accessible={false} />
          <Text style={[profile && effectivePage === 'profile' ? ui.small : ui.title, { flexShrink: 1 }]}>{t.app}</Text>
        </View>
        {profile && <Text style={ui.balance}>{profile.coins} {t.coins}</Text>}
      </View>
      {breakRemaining > 0 && <View style={[ui.card, ui.row]}>
        <Text style={ui.accent}>{t.autoBreak} · {formatTime(breakRemaining)}</Text>
        <Button compact muted onPress={() => setPage('room')}>{t.backToRoom}</Button>
      </View>}
      {actionError !== '' && <Text accessibilityLiveRegion="polite" style={ui.warning}>{actionError}</Text>}
      {!profile ? <AvatarEditor profile={null} onSave={payload => act({ name: 'profile', payload })} pending={pending} t={t} locale={locale} /> :
        effectivePage === 'rooms' ? <>
          <View style={ui.row}><Text style={ui.heading}>{t.rooms}</Text>
            <View style={{ flexShrink: 1 }}><Button muted onPress={() => setRankingOpen(true)}>{t.leaderboard}</Button></View></View>
          {invitations}
          <Directory rooms={snapshot.rooms} current={profile.room} pending={pending} ownsPrivateRoom={!!profile.ownsPrivateRoom}
          coins={profile.coins} locale={locale} t={t}
          join={room => room === localRoom ? setPage('room') : act({ name: 'join', payload: { room } })}
          enter={code => act({ name: 'joinCode', payload: { code } })}
          create={name => act({ name: 'createRoom', payload: { name } })} />
        </> : effectivePage === 'room' ? <>
          {room && <View style={ui.row}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
              <Text style={ui.heading}>{label(room)}</Text>{room.private && <PrivateBadge t={t} />}
            </View>
            <Text style={ui.small}>{room.count}/{room.capacity}</Text>
            {!running && !!accepted.length && <Button muted accessibilityLabel={t.friendInvite} onPress={() => setInviteOpen(true)}>♙+</Button>}
          </View>}
          {room && <RoomGoal progress={roomProgressMinutes(snapshot.roomGoal, observed)} t={t} />}
          <RoomScene room={localRoom ?? null} members={roomMembers} now={snapshot.now}
            aurora={aurora} theme={theme} t={t} onDeskPress={running ? undefined : member => {
              setActionError('');
              setPeer(member.desk_ref);
            }} />
          {room && quietToggle}
          {room && !running && <ThemePicker value={theme} room={room.id} aurora={aurora} onChange={setTheme} t={t} />}
          {room && !running && <Invite room={room} t={t} />}
          {snapshot.session?.state === 'completed' && <>
            <Text style={ui.accent}>{t.reward}</Text>
            <Button muted onPress={() => setCardOpen(true)}>{t.studyCard}</Button>
          </>}
          {snapshot.session?.state === 'invalid' && <Text style={ui.warning}>{t.invalid}</Text>}
          <Period focus={focus} remaining={focus ? focusRemaining(focus, pendingPauseAt ?? observed) : 0}
            t={t} pending={pending} canStart={Boolean(room)} breakRemaining={breakRemaining} onAction={act} />
          {!focus && room && !breakRemaining && <View style={ui.card}>
            <Options label={label(room)} values={([['desk', t.desk], ['break', t.break]] as const)}
              value={profile.status ?? 'desk'} onChange={status => act({ name: 'status', payload: { status } })} />
          </View>}
          {!running && room && <Button muted disabled={pending} onPress={requestLeave}>{t.leave}</Button>}
          {room && <Ambience locked={running} inventory={snapshot.inventory} t={t} />}
        </> : effectivePage === 'shop' ? <>
          <ShopRewards snapshot={snapshot} serverNow={observed} pending={pending} t={t}
            refresh={() => void query.refetch()} openChest={() => act({ name: 'openChest' })} />
          <FocusQuests daily={snapshot.dailyQuests} weekly={snapshot.weeklyQuests} t={t} />
          <Catalog snapshot={snapshot} t={t} locale={locale} pending={pending}
            action={item => act({ name: 'buy', payload: { item } })}
            openBox={(tier, price) => act({ name: 'openBox', payload: { tier, price } })} /></> : effectivePage === 'games' ? <Games locale={locale} t={t} /> :
          <>
            <View style={profileStyles.header}>
              <Text accessibilityRole="header" style={profileStyles.title}>{t.profileInventory}</Text>
              <View style={profileStyles.shortcuts}>
                <View style={profileStyles.shortcut}><Button compact muted onPress={() => setCardOpen(true)}>{t.studyCardAction}</Button></View>
                <View style={profileStyles.shortcut}><Button compact muted onPress={() => setRankingOpen(true)}>{t.leaderboard}</Button></View>
              </View>
            </View>
            {editing ? <AvatarEditor profile={profile} onSave={payload => act({ name: 'profile', payload })} pending={pending} t={t} locale={locale} /> :
              <ProfileOverview profile={profile} accountId={id} equipment={equipped} pending={pending} t={t}
                onEdit={() => setEditing(true)} onLeave={requestLeave} />}
            <TargetEditor initial={profile.target ?? ''} pending={pending} t={t} save={target => act({ name: 'target', payload: { target } })} />
            <FocusQuests daily={snapshot.dailyQuests} weekly={snapshot.weeklyQuests} t={t} />
            <View style={[ui.card, { flexDirection: 'row', gap: 12 }]} accessibilityLabel={t.studyTotals}>
              <View style={{ flex: 1 }}><Text style={ui.small}>{t.focusToday}</Text>
                <Text style={ui.accent}>{snapshot.dailyQuests?.minutes ?? 0} {t.minuteUnit}</Text></View>
              <View style={{ flex: 1 }}><Text style={ui.small}>{t.focusWeek}</Text>
                <Text style={ui.accent}>{snapshot.weeklyQuests?.goals.find(goal => goal.unit === 'minutes')?.progress ?? 0} {t.minuteUnit}</Text></View>
            </View>
            {invitations}
            <View style={{ marginTop: 6 }}>{quietToggle}</View>
            <FriendsPanel profile={profile} friends={friends} pending={pending} now={observed} t={t}
              add={code => act({ name: 'addFriend', payload: { code } })}
              answer={(id, answer) => act({ name: 'answerFriend', payload: { id, answer } })}
              remove={id => act({ name: 'removeFriend', payload: { id } })}
              invite={id => act({ name: 'inviteFriend', payload: { id } })} />
            <Catalog snapshot={snapshot} inventory t={t} locale={locale} pending={pending}
              action={item => act({ name: 'place', payload: { item } })} />
          </>}
      {(!profile || effectivePage === 'profile') && <>
        <View style={ui.card}>
          <Options label="TR / EN" values={([['tr', 'Türkçe'], ['en', 'English']] as const)} value={locale} onChange={setLocale} />
          <View style={ui.row}><Text style={ui.heading}>{t.alerts}</Text><Switch accessibilityLabel={t.alerts} value={alerts}
            onValueChange={value => {
              if (value) void allowReminders().then(setAlerts).catch(() => setAlerts(false));
              else { setAlerts(false); void removeRemoteReminders().catch(error => setActionError(message(t, error))); }
            }} /></View>
          {alerts && hasExactReminderSettings && <Button muted onPress={() => void openExactReminderSettings()
            .then(() => setReminderRevision(current => current + 1), () => setActionError(t.exactReminderError))}>
            {t.exactReminderSettings}
          </Button>}
          {hasAnalytics && <View style={ui.row}><Text style={ui.heading}>{t.usage}</Text><Switch accessibilityLabel={t.usage}
            value={usage} onValueChange={setUsage} /></View>}
        </View>
        <View style={ui.card}>
          <Text style={ui.heading}>{t.myAccount}</Text>
          <Button tone="data" disabled={pending} onPress={() => setAccountPanel('data')}>{t.myData}</Button>
          <Button tone="signOut" disabled={pending} onPress={() => setAccountPanel('signOut')}>{t.signOut}</Button>
          <TermsButton locale={locale} t={t} />
          <Button tone="danger" disabled={pending} onPress={() => setAccountPanel('delete')}>{t.deleteAccount}</Button>
        </View>
      </>}
    </ScrollView>
    {profile && <View style={ui.nav}>
      {(['rooms', 'room', 'shop', 'games', 'profile'] as const).map(tab =>
        <Pressable key={tab} accessibilityRole="tab" disabled={running} onPress={() => tab === 'rooms' && localRoom && !breakRemaining ? requestLeave() : setPage(tab)}
          accessibilityState={{ selected: tab === effectivePage, disabled: running }} style={[ui.navTab, tab === effectivePage && ui.navActive, running && { opacity: .46 }]}>
          <Text style={[ui.navText, tab === effectivePage && ui.accent]}>{t[tab]}{tab === 'profile' && unread > 0 ? ` · ${unread}` : ''}</Text>
        </Pressable>)}
    </View>}
    {rankingOpen && !running && !verify && <LeaderboardModal user={id} t={t} close={() => setRankingOpen(false)}
      pending={pending} changeVisibility={visible => act({ name: 'rankingVisibility', payload: { visible } })} />}
    {cardOpen && profile && !running && !verify && <StudyCardModal user={id} profile={profile}
      equipment={equipped} close={() => setCardOpen(false)} t={t} />}
    {accountPanel && !running && <AccountSheet panel={accountPanel} change={setAccountPanel} confirm={confirmAccount}
      deleted={() => signOut(true)} leaveCopy={leaveCopy} inRoom={!!localRoom} locale={locale} t={t} />}
    {profile?.tourPending && !accountPanel && !running && !verify && <TourSheet t={t} pending={pending} error={actionError}
      finish={() => act({ name: 'finishTour' })} />}
    <Modal visible={inviteOpen && !!room && !running && !verify} transparent onRequestClose={() => setInviteOpen(false)} accessibilityViewIsModal>
      <View style={ui.modal}><View style={[ui.card, { width: '100%', maxWidth: 450, maxHeight: '80%' }]}>
        <Text style={ui.heading}>{t.friendInvite}</Text>
        <ScrollView contentContainerStyle={{ gap: 7 }}>
          {accepted.map(friend => <FriendInviteButton key={friend.id} friend={friend} label={friend.name} pending={pending} now={observed} t={t}
            onPress={() => act({ name: 'inviteFriend', payload: { id: friend.id } })} />)}
        </ScrollView>
        {actionError !== '' && <Text style={ui.warning}>{actionError}</Text>}
        <Button muted onPress={() => setInviteOpen(false)}>{t.done}</Button>
      </View></View>
    </Modal>
    <CoinNotice awards={snapshot.coinAwards} account={id} locale={locale} t={t}
      enabled={foreground && !prize && !verify && !profile?.tourPending && !accountPanel && !selectedPeer
        && !rankingOpen && !cardOpen && !inviteOpen} />
    <Modal visible={Boolean(selectedPeer?.desk_ref && !running && !verify)} transparent onRequestClose={() => setPeer(undefined)} accessibilityViewIsModal>
      <View style={ui.modal}><View style={ui.card}>
        <Text style={ui.heading}>{selectedPeer?.name}</Text>
        {selectedPeer?.acceptsInteractions === false && <Text style={ui.small}>{t.interactionUnavailable}</Text>}
        {(['coffee', 'clap'] as const).map(kind => <Button key={kind} disabled={pending || selectedPeer?.acceptsInteractions === false || (kind === 'coffee' && (profile?.coins ?? 0) < 1)} onPress={() => {
          if (selectedPeer?.desk_ref) act({ name: 'react', payload: { desk: selectedPeer.desk_ref, kind } });
        }}>{kind === 'coffee' ? t.coffeeReaction : t.clapReaction}</Button>)}
        {room && !room.private && selectedPeer?.desk_ref && !selectedPeer.friendStatus &&
          <Button muted disabled={pending} onPress={() => {
            if (selectedPeer.desk_ref) act({ name: 'addDeskFriend', payload: { desk: selectedPeer.desk_ref } });
          }}>{t.addFriend}</Button>}
        {selectedPeer?.friendStatus && <Text style={ui.small}>{t[({
          accepted: 'friendsWithPeer', sent: 'friendSent', incoming: 'friendIncoming',
        } as const)[selectedPeer.friendStatus]]}</Text>}
        {actionError !== '' && <Text style={ui.warning}>{actionError}</Text>}
        <Button muted onPress={() => setPeer(undefined)}>{t.done}</Button>
      </View></View>
    </Modal>
    {prize && !verify && <ChestReward tier={prize.tier} item={prizeItem}
      title={prizeItem ? label(prizeItem) : prizeId ?? ('coins' in prize.drop ? `${prize.drop.coins} ${t.coins}` : '')}
      t={t} close={() => setPrize(null)} />}
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
